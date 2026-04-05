const { useState, useEffect, useRef, useMemo } = React;

// ===== Конфигурация =====
const STORAGE_KEY = 'kanban-v4';

const COLUMNS = [
  { id: 'today',     title: 'Сегодня',              color: '#FF6B6B' },
  { id: 'week',      title: 'На неделю',            color: '#FBBF24' },
  { id: 'urgent',    title: 'Срочно / Важно',       color: '#F97316' },
  { id: 'important', title: 'Важно / Не срочно',    color: '#38BDF8' },
  { id: 'later',     title: 'Не срочно / Не важно', color: '#A78BFA' },
  { id: 'done',      title: 'Сделано',              color: '#34D399' },
];

const DEPTS = [
  { id: 'sales',     name: 'Продажи',     color: '#FB923C' },
  { id: 'marketing', name: 'Маркетинг',   color: '#A78BFA' },
  { id: 'ops',       name: 'Операционка', color: '#38BDF8' },
];

const COMPANIES = [
  { id: 'kg', name: 'КиберГусли', short: 'КГ', color: '#34D399' },
  { id: 'kc', name: 'КЦ',         short: 'КЦ', color: '#FBBF24' },
  { id: 'pf', name: 'ПФ',         short: 'ПФ', color: '#F472B6' },
];

const DEPT_IDS = ['sales', 'marketing', 'ops'];
const COMPANY_IDS = ['kg', 'kc', 'pf'];

const getDept = (id) => DEPTS.find(d => d.id === id);
const getCompany = (id) => COMPANIES.find(c => c.id === id);
const getColumn = (id) => COLUMNS.find(c => c.id === id);

// ===== Утилиты =====
const newId = () => Math.random().toString(36).slice(2, 11);

const sessionDuration = (s, now = Date.now()) => {
  const end = s.end == null ? now : s.end;
  return Math.max(0, end - s.start);
};

const taskTotal = (task, now = Date.now()) =>
  task.sessions.reduce((acc, s) => acc + sessionDuration(s, now), 0);

const taskTotalInRange = (task, from, to) => {
  let sum = 0;
  const now = Date.now();
  for (const s of task.sessions) {
    const start = s.start;
    const end = s.end == null ? now : s.end;
    const a = Math.max(start, from);
    const b = Math.min(end, to);
    if (b > a) sum += (b - a);
  }
  return sum;
};

const isActiveSession = (s) => s.end == null;
const taskHasActive = (t) => t.sessions.some(isActiveSession);
const taskStatus = (t) => {
  if (t.sessions.length === 0) return 'waiting';
  if (taskHasActive(t)) return 'running';
  return 'paused';
};

const fmtDuration = (ms) => {
  if (ms <= 0) return '0с';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}с`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) {
    const sec = totalSec % 60;
    return `${totalMin}м ${sec}с`;
  }
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}ч ${m}м`;
};

const fmtHours = (ms) => (ms / 3600000).toFixed(1);

const fmtDate = (ts) => {
  const d = new Date(ts);
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

// ===== Стили-хелперы =====
const S = {
  app: { minHeight: '100vh', background: '#E2E8F0', color: '#0F172A', display: 'flex', flexDirection: 'column' },
  header: {
    padding: '14px 20px',
    borderBottom: '1px solid rgba(15,23,42,0.08)',
    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    background: '#F1F5F9'
  },
  logo: { fontWeight: 700, fontSize: 18, letterSpacing: '-0.01em', color: '#0F172A' },
  tabs: { display: 'flex', background: '#E2E8F0', borderRadius: 8, padding: 3 },
  tab: (active) => ({
    padding: '7px 16px', borderRadius: 6, fontSize: 13, fontWeight: 500,
    color: active ? '#0284C7' : '#64748B',
    background: active ? '#FFFFFF' : 'transparent',
    boxShadow: active ? '0 1px 2px rgba(15,23,42,0.06)' : 'none',
    transition: 'all 0.15s'
  }),
  resetBtn: {
    marginLeft: 'auto', padding: '7px 14px', fontSize: 12, fontWeight: 500,
    border: '1px solid rgba(220,38,38,0.3)', color: '#DC2626',
    borderRadius: 6, background: 'transparent', transition: 'all 0.15s'
  },
  container: { padding: 20, flex: 1, overflowY: 'auto' },
  card: {
    background: '#FFFFFF',
    border: '1px solid rgba(15,23,42,0.08)',
    borderRadius: 10, padding: 12
  },
  input: {
    background: '#FFFFFF',
    border: '1px solid rgba(15,23,42,0.12)',
    borderRadius: 6, padding: '8px 12px', color: '#0F172A',
    fontSize: 14, width: '100%', fontFamily: 'DM Sans'
  },
  chip: (active, color) => ({
    padding: '5px 10px', fontSize: 11, fontWeight: 500, borderRadius: 6,
    border: `1px solid ${active ? color : 'rgba(15,23,42,0.12)'}`,
    background: active ? `${color}1A` : '#FFFFFF',
    color: active ? color : '#475569',
    transition: 'all 0.15s', fontFamily: 'JetBrains Mono'
  }),
  badge: (color, bg) => ({
    padding: '2px 7px', fontSize: 10, fontWeight: 600, borderRadius: 4,
    color: color, background: bg || `${color}1A`, fontFamily: 'JetBrains Mono',
    display: 'inline-flex', alignItems: 'center', gap: 4, letterSpacing: '0.02em'
  }),
};

// ===== Компоненты =====

function StatusBadge({ status }) {
  const map = {
    waiting: { text: 'Ожидает',  color: '#64748B' },
    running: { text: 'В работе', color: '#059669' },
    paused:  { text: 'Пауза',    color: '#D97706' },
  };
  const s = map[status];
  return (
    <span style={S.badge(s.color)}>
      {status === 'running' && <span className="pulse" style={{ width: 5, height: 5, borderRadius: '50%', background: '#059669', display: 'inline-block' }} />}
      {s.text}
    </span>
  );
}

function TaskCard({ task, isActive, onStart, onPause, onCycleDept, onCycleCompany, onDelete, onOpen, onDragStart, now }) {
  const status = taskStatus(task);
  const total = taskTotal(task, now);
  const dept = getDept(task.dept);
  const company = getCompany(task.company);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      className="card-hover"
      style={{ ...S.card, cursor: 'grab', marginBottom: 8 }}
    >
      {/* tags row */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <StatusBadge status={status} />
        {dept && <span style={S.badge(dept.color)}>{dept.name}</span>}
        {company && <span style={S.badge(company.color)}>{company.short}</span>}
      </div>

      {/* title */}
      <div
        onClick={onOpen}
        style={{ fontSize: 14, fontWeight: 500, color: '#0F172A', marginBottom: 10, lineHeight: 1.35, wordBreak: 'break-word', cursor: 'pointer' }}
      >
        {task.title}
      </div>

      {/* timer display */}
      <div className="mono" style={{ fontSize: 13, color: isActive ? '#059669' : '#64748B', marginBottom: 10, fontWeight: 500 }}>
        {fmtDuration(total)}
      </div>

      {/* buttons */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {status === 'running' ? (
          <button
            className="btn-hover"
            onClick={onPause}
            style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 5, background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' }}
          >⏸ Пауза</button>
        ) : (
          <button
            className="btn-hover"
            onClick={onStart}
            style={{ padding: '5px 10px', fontSize: 11, fontWeight: 600, borderRadius: 5, background: '#D1FAE5', color: '#059669', border: '1px solid #A7F3D0' }}
          >▶ {status === 'paused' ? 'Прод.' : 'Старт'}</button>
        )}
        <button className="btn-hover" onClick={onCycleDept} title="Сменить отдел"
          style={{ padding: '4px 8px', fontSize: 12, color: dept ? dept.color : '#94A3B8', borderRadius: 5, border: '1px solid rgba(15,23,42,0.1)', background: '#FFFFFF' }}>◆</button>
        <button className="btn-hover" onClick={onCycleCompany} title="Сменить компанию"
          style={{ padding: '4px 8px', fontSize: 12, color: company ? company.color : '#94A3B8', borderRadius: 5, border: '1px solid rgba(15,23,42,0.1)', background: '#FFFFFF' }}>●</button>
        <button className="btn-hover" onClick={onDelete} title="Удалить"
          style={{ padding: '4px 8px', fontSize: 12, color: '#64748B', borderRadius: 5, border: '1px solid rgba(15,23,42,0.1)', background: '#FFFFFF', marginLeft: 'auto' }}>×</button>
      </div>

      <div className="mono" style={{ fontSize: 10, color: '#94A3B8', marginTop: 8 }}>
        {fmtDate(task.createdAt)}
      </div>
    </div>
  );
}

function TaskModal({ task, onClose, onUpdate, onComplete, now }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [estimateHours, setEstimateHours] = useState(task.estimateMinutes ? String(task.estimateMinutes / 60) : '');
  const [result, setResult] = useState(task.result || '');

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setEstimateHours(task.estimateMinutes ? String(task.estimateMinutes / 60) : '');
    setResult(task.result || '');
  }, [task.id]);

  const startedAt = task.sessions.length > 0 ? Math.min(...task.sessions.map(s => s.start)) : null;
  const total = taskTotal(task, now);
  const status = taskStatus(task);
  const dept = getDept(task.dept);
  const company = getCompany(task.company);

  const save = () => {
    const patch = {
      title: title.trim() || task.title,
      description,
      estimateMinutes: estimateHours ? Math.round(parseFloat(estimateHours) * 60) : null,
      result,
    };
    onUpdate(patch);
    onClose();
  };

  const fmtDateTime = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const label = (text) => (
    <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 4, textTransform: 'uppercase' }}>{text}</div>
  );

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, zIndex: 100 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#F1F5F9', borderRadius: 14, padding: 24, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 10px 40px rgba(15,23,42,0.25)' }}
      >
        {/* header */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
          <StatusBadge status={status} />
          {dept && <span style={S.badge(dept.color)}>{dept.name}</span>}
          {company && <span style={S.badge(company.color)}>{company.short}</span>}
          <button onClick={onClose} className="btn-hover"
            style={{ marginLeft: 'auto', fontSize: 18, color: '#64748B', padding: '2px 8px', borderRadius: 5 }}>×</button>
        </div>

        {/* title */}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Название задачи"
          style={{ ...S.input, fontSize: 20, fontWeight: 600, padding: '10px 12px', marginBottom: 20 }}
        />

        {/* description */}
        <div style={{ marginBottom: 16 }}>
          {label('Описание')}
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="В чём состоит задача — подробно..."
            rows={5}
            style={{ ...S.input, resize: 'vertical', minHeight: 80, fontFamily: 'DM Sans', lineHeight: 1.5 }}
          />
        </div>

        {/* meta grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div>
            {label('Создана')}
            <div className="mono" style={{ fontSize: 13, color: '#0F172A' }}>{fmtDateTime(task.createdAt)}</div>
          </div>
          <div>
            {label('Займёт (предп.), ч')}
            <input
              type="number" step="0.25" min="0"
              value={estimateHours}
              onChange={e => setEstimateHours(e.target.value)}
              placeholder="0"
              style={{ ...S.input, padding: '6px 10px', fontSize: 13 }}
            />
          </div>
          <div>
            {label('Начало выполнения')}
            <div className="mono" style={{ fontSize: 13, color: startedAt ? '#0F172A' : '#94A3B8' }}>{fmtDateTime(startedAt)}</div>
          </div>
          <div>
            {label('Окончание')}
            <div className="mono" style={{ fontSize: 13, color: task.completedAt ? '#059669' : '#94A3B8' }}>{fmtDateTime(task.completedAt)}</div>
          </div>
          <div>
            {label('Потрачено')}
            <div className="mono" style={{ fontSize: 13, color: '#0284C7', fontWeight: 600 }}>{fmtDuration(total)}</div>
          </div>
        </div>

        {/* result */}
        <div style={{ marginBottom: 20 }}>
          {label('Результат')}
          <textarea
            value={result}
            onChange={e => setResult(e.target.value)}
            placeholder="Что получилось в итоге..."
            rows={3}
            style={{ ...S.input, resize: 'vertical', minHeight: 60, fontFamily: 'DM Sans', lineHeight: 1.5 }}
          />
        </div>

        {/* actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={save} className="btn-hover"
            style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 6, background: '#0284C7', color: '#FFFFFF' }}>
            Сохранить
          </button>
          {task.column !== 'done' && (
            <button onClick={() => { save(); onComplete(); }} className="btn-hover"
              style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 6, background: '#D1FAE5', color: '#059669', border: '1px solid #A7F3D0' }}>
              ✓ Выполнено
            </button>
          )}
          <button onClick={onClose} className="btn-hover"
            style={{ padding: '9px 18px', fontSize: 13, fontWeight: 500, borderRadius: 6, color: '#64748B', border: '1px solid rgba(15,23,42,0.12)', marginLeft: 'auto' }}>
            Отмена
          </button>
        </div>
      </div>
    </div>
  );
}

function AddTaskForm({ onAdd }) {
  const [title, setTitle] = useState('');
  const [dept, setDept] = useState(null);
  const [company, setCompany] = useState(null);

  const submit = () => {
    const v = title.trim();
    if (!v) return;
    onAdd(v, dept, company);
    setTitle(''); setDept(null); setCompany(null);
  };

  return (
    <div style={{ ...S.card, marginBottom: 16 }}>
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') { setTitle(''); setDept(null); setCompany(null); }
        }}
        placeholder="Новая задача... (Enter)"
        style={{ ...S.input, marginBottom: 10 }}
      />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {DEPTS.map(d => (
          <button key={d.id} onClick={() => setDept(dept === d.id ? null : d.id)} style={S.chip(dept === d.id, d.color)}>
            {d.name}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {COMPANIES.map(c => (
          <button key={c.id} onClick={() => setCompany(company === c.id ? null : c.id)} style={S.chip(company === c.id, c.color)}>
            {c.short}
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterBar({ deptFilter, setDeptFilter, companyFilter, setCompanyFilter }) {
  return (
    <div style={{ ...S.card, marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748B', fontWeight: 500, marginRight: 4 }}>ОТДЕЛ</span>
        <button onClick={() => setDeptFilter(null)} style={S.chip(deptFilter === null, '#64748B')}>Все</button>
        {DEPTS.map(d => (
          <button key={d.id} onClick={() => setDeptFilter(deptFilter === d.id ? null : d.id)} style={S.chip(deptFilter === d.id, d.color)}>{d.name}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#64748B', fontWeight: 500, marginRight: 4 }}>КОМПАНИЯ</span>
        <button onClick={() => setCompanyFilter(null)} style={S.chip(companyFilter === null, '#64748B')}>Все</button>
        {COMPANIES.map(c => (
          <button key={c.id} onClick={() => setCompanyFilter(companyFilter === c.id ? null : c.id)} style={S.chip(companyFilter === c.id, c.color)}>{c.short}</button>
        ))}
      </div>
    </div>
  );
}

function SummaryBar({ tasks, activeTask, now }) {
  const total = tasks.length;
  const done = tasks.filter(t => t.column === 'done').length;
  const totalTime = tasks.reduce((s, t) => s + taskTotal(t, now), 0);
  const doneTime = tasks.filter(t => t.column === 'done').reduce((s, t) => s + taskTotal(t, now), 0);

  const item = (label, value, color) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 10, color: '#64748B', fontWeight: 500, letterSpacing: '0.05em' }}>{label}</div>
      <div className="mono" style={{ fontSize: 14, color: color || '#0F172A', fontWeight: 600 }}>{value}</div>
    </div>
  );

  return (
    <div style={{ ...S.card, marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
      {item('ЗАДАЧ', total)}
      {item('СДЕЛАНО', done, '#059669')}
      {item('ВРЕМЯ', fmtDuration(totalTime))}
      {item('ВРЕМЯ СДЕЛАНО', fmtDuration(doneTime), '#059669')}
      {activeTask && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', padding: '6px 12px', background: '#D1FAE5', borderRadius: 6, border: '1px solid #A7F3D0' }}>
          <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669' }} />
          <span style={{ fontSize: 12, color: '#059669', fontWeight: 500 }}>{activeTask.title}</span>
        </div>
      )}
    </div>
  );
}

function KanbanColumn({ column, tasks, allTasks, activeId, onDrop, onTaskAction, now, onDragStart, onAddTask, onOpenTask }) {
  const [dragOver, setDragOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const total = tasks.reduce((s, t) => s + taskTotal(t, now), 0);
  const totalInColumn = allTasks.filter(t => t.column === column.id).length;
  const hiddenCount = totalInColumn - tasks.length;

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); onDrop(column.id); }}
      className={dragOver ? 'drag-over' : ''}
      style={{
        minWidth: 280, width: 280, flexShrink: 0,
        background: '#CBD5E1',
        border: '1px solid rgba(15,23,42,0.08)',
        borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column',
        transition: 'all 0.15s'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 10, borderBottom: `2px solid ${column.color}55` }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: column.color }} />
        <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', flex: 1 }}>{column.title}</div>
        <span className="mono" style={{ fontSize: 10, color: '#64748B', fontWeight: 500 }}>
          {totalInColumn !== tasks.length ? `${tasks.length}/${totalInColumn}` : tasks.length}
        </span>
        <span className="mono" style={{ fontSize: 10, color: column.color, fontWeight: 600 }}>
          Σ {fmtDuration(total)}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 40 }}>
        {tasks.length === 0 && hiddenCount === 0 && (
          <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>— пусто —</div>
        )}
        {tasks.length === 0 && hiddenCount > 0 && (
          <div style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>{hiddenCount} скрыто</div>
        )}
        {tasks.map(t => (
          <TaskCard
            key={t.id} task={t} now={now} isActive={activeId === t.id}
            onDragStart={onDragStart}
            onStart={() => onTaskAction('start', t.id)}
            onPause={() => onTaskAction('pause', t.id)}
            onCycleDept={() => onTaskAction('cycleDept', t.id)}
            onCycleCompany={() => onTaskAction('cycleCompany', t.id)}
            onDelete={() => onTaskAction('delete', t.id)}
            onOpen={() => onOpenTask(t.id)}
          />
        ))}
      </div>

      {adding ? (
        <input
          autoFocus value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          onBlur={() => {
            const v = newTitle.trim();
            if (v) onAddTask(column.id, v);
            setNewTitle(''); setAdding(false);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              const v = newTitle.trim();
              if (v) { onAddTask(column.id, v); setNewTitle(''); }
              else setAdding(false);
            }
            if (e.key === 'Escape') { setNewTitle(''); setAdding(false); }
          }}
          placeholder="Название задачи..."
          style={{ ...S.input, marginTop: 4 }}
        />
      ) : (
        <button
          className="btn-hover"
          onClick={() => setAdding(true)}
          style={{
            marginTop: 4, padding: '8px 10px', fontSize: 12, fontWeight: 500,
            color: '#64748B', textAlign: 'left', borderRadius: 6,
            border: '1px dashed rgba(15,23,42,0.15)', background: 'transparent',
            width: '100%'
          }}
        >+ Создать задачу</button>
      )}
    </div>
  );
}

function KanbanView({ tasks, activeId, setTasks, setActiveId, now }) {
  const [deptFilter, setDeptFilter] = useState(null);
  const [companyFilter, setCompanyFilter] = useState(null);
  const draggedId = useRef(null);

  const onDragStart = (e, id) => {
    draggedId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (columnId) => {
    const id = draggedId.current;
    if (!id) return;
    setTasks(prev => prev.map(t => t.id === id ? { ...t, column: columnId } : t));
    draggedId.current = null;
  };

  const [openTaskId, setOpenTaskId] = useState(null);

  const addTask = (title, dept, company, column = 'today') => {
    setTasks(prev => [...prev, {
      id: newId(), title, column, dept, company,
      sessions: [], createdAt: Date.now(),
      description: '', estimateMinutes: null, completedAt: null, result: ''
    }]);
  };

  const addTaskToColumn = (columnId, title) => addTask(title, null, null, columnId);

  const updateTask = (id, patch) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  };

  const completeTask = (id) => {
    const nowTs = Date.now();
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      // close any active session
      const sessions = t.sessions.map(s => s.end == null ? { ...s, end: nowTs } : s);
      return { ...t, sessions, column: 'done', completedAt: nowTs };
    }));
    if (activeId === id) setActiveId(null);
  };

  const cycleValue = (cur, list) => {
    if (cur == null) return list[0];
    const i = list.indexOf(cur);
    if (i === -1 || i === list.length - 1) return null;
    return list[i + 1];
  };

  const handleTaskAction = (action, id, payload) => {
    if (action === 'start') {
      const nowTs = Date.now();
      setTasks(prev => prev.map(t => {
        // pause any active
        if (t.id !== id && taskHasActive(t)) {
          return { ...t, sessions: t.sessions.map(s => s.end == null ? { ...s, end: nowTs } : s) };
        }
        if (t.id === id) {
          // close any existing active just in case, then open new
          const closed = t.sessions.map(s => s.end == null ? { ...s, end: nowTs } : s);
          return { ...t, sessions: [...closed, { start: nowTs, end: null }] };
        }
        return t;
      }));
      setActiveId(id);
    } else if (action === 'pause') {
      const nowTs = Date.now();
      setTasks(prev => prev.map(t => t.id === id
        ? { ...t, sessions: t.sessions.map(s => s.end == null ? { ...s, end: nowTs } : s) }
        : t));
      setActiveId(null);
    } else if (action === 'cycleDept') {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, dept: cycleValue(t.dept, DEPT_IDS) } : t));
    } else if (action === 'cycleCompany') {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, company: cycleValue(t.company, COMPANY_IDS) } : t));
    } else if (action === 'delete') {
      setTasks(prev => prev.filter(t => t.id !== id));
      if (activeId === id) setActiveId(null);
    } else if (action === 'rename') {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, title: payload } : t));
    }
  };

  const filtered = tasks.filter(t =>
    (deptFilter == null || t.dept === deptFilter) &&
    (companyFilter == null || t.company === companyFilter)
  );

  const activeTask = activeId ? tasks.find(t => t.id === activeId) : null;

  return (
    <div>
      <SummaryBar tasks={tasks} activeTask={activeTask} now={now} />
      <AddTaskForm onAdd={addTask} />
      <FilterBar
        deptFilter={deptFilter} setDeptFilter={setDeptFilter}
        companyFilter={companyFilter} setCompanyFilter={setCompanyFilter}
      />
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12 }}>
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.id} column={col} now={now}
            tasks={filtered.filter(t => t.column === col.id)}
            allTasks={tasks}
            activeId={activeId}
            onDrop={handleDrop}
            onDragStart={onDragStart}
            onTaskAction={handleTaskAction}
            onAddTask={addTaskToColumn}
            onOpenTask={setOpenTaskId}
          />
        ))}
      </div>
      {openTaskId && tasks.find(t => t.id === openTaskId) && (
        <TaskModal
          task={tasks.find(t => t.id === openTaskId)}
          now={now}
          onClose={() => setOpenTaskId(null)}
          onUpdate={(patch) => updateTask(openTaskId, patch)}
          onComplete={() => { completeTask(openTaskId); setOpenTaskId(null); }}
        />
      )}
    </div>
  );
}

// ===== Отчёты =====

function BarChart({ title, rows, maxVal }) {
  return (
    <div style={{ ...S.card, flex: 1, minWidth: 280 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 14, letterSpacing: '0.02em' }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(r => {
          const pct = maxVal > 0 ? (r.value / maxVal) * 100 : 0;
          return (
            <div key={r.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: '#334155' }}>{r.label}</span>
                <span className="mono" style={{ fontSize: 12, color: r.color, fontWeight: 600 }}>{fmtHours(r.value)} ч</span>
              </div>
              <div style={{ height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: r.color, borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportsView({ tasks }) {
  const [period, setPeriod] = useState('week');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { from, to } = useMemo(() => {
    const now = Date.now();
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    if (period === 'today') return { from: startOfDay.getTime(), to: now };
    if (period === 'week')  return { from: now - 7 * 86400000, to: now };
    if (period === 'month') return { from: now - 30 * 86400000, to: now };
    if (period === 'all')   return { from: 0, to: now };
    if (period === 'custom') {
      const f = customFrom ? new Date(customFrom).getTime() : 0;
      const toDate = customTo ? new Date(customTo) : new Date();
      toDate.setHours(23, 59, 59, 999);
      return { from: f, to: toDate.getTime() };
    }
    return { from: 0, to: now };
  }, [period, customFrom, customTo]);

  const tasksWithTime = useMemo(() =>
    tasks.map(t => ({ ...t, rangeTime: taskTotalInRange(t, from, to) }))
      .filter(t => t.rangeTime > 0),
    [tasks, from, to]
  );

  const totalTime = tasksWithTime.reduce((s, t) => s + t.rangeTime, 0);

  const byDept = useMemo(() => {
    const map = { sales: 0, marketing: 0, ops: 0, none: 0 };
    tasksWithTime.forEach(t => { map[t.dept || 'none'] += t.rangeTime; });
    return map;
  }, [tasksWithTime]);

  const byCompany = useMemo(() => {
    const map = { kg: 0, kc: 0, pf: 0, none: 0 };
    tasksWithTime.forEach(t => { map[t.company || 'none'] += t.rangeTime; });
    return map;
  }, [tasksWithTime]);

  const deptRows = [
    ...DEPTS.map(d => ({ key: d.id, label: d.name, color: d.color, value: byDept[d.id] })),
    { key: 'none', label: 'Без отдела', color: '#64748B', value: byDept.none },
  ];
  const companyRows = [
    ...COMPANIES.map(c => ({ key: c.id, label: c.name, color: c.color, value: byCompany[c.id] })),
    { key: 'none', label: 'Без компании', color: '#64748B', value: byCompany.none },
  ];

  const maxVal = Math.max(...deptRows.map(r => r.value), ...companyRows.map(r => r.value), 0.001);

  // Cross table dept x company
  const cross = useMemo(() => {
    const matrix = {};
    DEPTS.forEach(d => { matrix[d.id] = { kg: 0, kc: 0, pf: 0, none: 0, total: 0 }; });
    matrix['none'] = { kg: 0, kc: 0, pf: 0, none: 0, total: 0 };
    tasksWithTime.forEach(t => {
      const dk = t.dept || 'none';
      const ck = t.company || 'none';
      matrix[dk][ck] += t.rangeTime;
      matrix[dk].total += t.rangeTime;
    });
    const colTotals = { kg: 0, kc: 0, pf: 0, none: 0, total: 0 };
    Object.values(matrix).forEach(row => {
      colTotals.kg += row.kg; colTotals.kc += row.kc; colTotals.pf += row.pf;
      colTotals.none += row.none; colTotals.total += row.total;
    });
    return { matrix, colTotals };
  }, [tasksWithTime]);

  const topTasks = useMemo(() =>
    [...tasksWithTime].sort((a, b) => b.rangeTime - a.rangeTime).slice(0, 15),
    [tasksWithTime]
  );

  const periodBtn = (id, label) => (
    <button key={id} onClick={() => setPeriod(id)} style={S.chip(period === id, '#38BDF8')}>{label}</button>
  );

  const cellHours = (ms) => ms > 0 ? fmtHours(ms) : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* period picker */}
      <div style={{ ...S.card, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {periodBtn('today', 'Сегодня')}
        {periodBtn('week', '7 дней')}
        {periodBtn('month', '30 дней')}
        {periodBtn('all', 'Всё время')}
        {periodBtn('custom', 'Свой период')}
        {period === 'custom' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 8 }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ ...S.input, width: 'auto', padding: '6px 8px' }} />
            <span style={{ color: '#64748B' }}>→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ ...S.input, width: 'auto', padding: '6px 8px' }} />
          </div>
        )}
      </div>

      {/* summary */}
      <div style={{ ...S.card, display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500, letterSpacing: '0.05em', marginBottom: 4 }}>ОБЩЕЕ ВРЕМЯ</div>
          <div className="mono" style={{ fontSize: 28, color: '#0F172A', fontWeight: 600 }}>{fmtHours(totalTime)} ч</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#64748B', fontWeight: 500, letterSpacing: '0.05em', marginBottom: 4 }}>ЗАДАЧ</div>
          <div className="mono" style={{ fontSize: 28, color: '#0284C7', fontWeight: 600 }}>{tasksWithTime.length}</div>
        </div>
      </div>

      {/* bars */}
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <BarChart title="ПО НАПРАВЛЕНИЯМ" rows={deptRows} maxVal={maxVal} />
        <BarChart title="ПО КОМПАНИЯМ" rows={companyRows} maxVal={maxVal} />
      </div>

      {/* cross table */}
      <div style={S.card}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 14, letterSpacing: '0.02em' }}>НАПРАВЛЕНИЕ × КОМПАНИЯ (ч)</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="mono" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748B', fontWeight: 500, borderBottom: '1px solid rgba(15,23,42,0.1)' }}></th>
                {COMPANIES.map(c => (
                  <th key={c.id} style={{ padding: '8px 12px', color: c.color, fontWeight: 600, borderBottom: '1px solid rgba(15,23,42,0.1)', textAlign: 'right' }}>{c.short}</th>
                ))}
                <th style={{ padding: '8px 12px', color: '#94A3B8', fontWeight: 600, borderBottom: '1px solid rgba(15,23,42,0.1)', textAlign: 'right' }}>Без</th>
                <th style={{ padding: '8px 12px', color: '#0F172A', fontWeight: 600, borderBottom: '1px solid rgba(15,23,42,0.1)', textAlign: 'right' }}>Σ</th>
              </tr>
            </thead>
            <tbody>
              {[...DEPTS, { id: 'none', name: 'Без отдела', color: '#94A3B8' }].map(d => {
                const row = cross.matrix[d.id];
                return (
                  <tr key={d.id}>
                    <td style={{ padding: '8px 12px', color: d.color, fontWeight: 500, borderBottom: '1px solid rgba(15,23,42,0.05)' }}>{d.name}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155', borderBottom: '1px solid rgba(15,23,42,0.05)' }}>{cellHours(row.kg)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155', borderBottom: '1px solid rgba(15,23,42,0.05)' }}>{cellHours(row.kc)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155', borderBottom: '1px solid rgba(15,23,42,0.05)' }}>{cellHours(row.pf)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#334155', borderBottom: '1px solid rgba(15,23,42,0.05)' }}>{cellHours(row.none)}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', color: '#0F172A', fontWeight: 600, borderBottom: '1px solid rgba(15,23,42,0.05)' }}>{cellHours(row.total)}</td>
                  </tr>
                );
              })}
              <tr>
                <td style={{ padding: '8px 12px', color: '#0F172A', fontWeight: 600, borderTop: '1px solid rgba(15,23,42,0.1)' }}>Σ</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#0F172A', fontWeight: 600, borderTop: '1px solid rgba(15,23,42,0.1)' }}>{cellHours(cross.colTotals.kg)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#0F172A', fontWeight: 600, borderTop: '1px solid rgba(15,23,42,0.1)' }}>{cellHours(cross.colTotals.kc)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#0F172A', fontWeight: 600, borderTop: '1px solid rgba(15,23,42,0.1)' }}>{cellHours(cross.colTotals.pf)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#0F172A', fontWeight: 600, borderTop: '1px solid rgba(15,23,42,0.1)' }}>{cellHours(cross.colTotals.none)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: '#0284C7', fontWeight: 700, borderTop: '1px solid rgba(15,23,42,0.1)' }}>{cellHours(cross.colTotals.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* top tasks */}
      <div style={S.card}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 14, letterSpacing: '0.02em' }}>ТОП ЗАДАЧ ПО ВРЕМЕНИ (до 15)</div>
        {topTasks.length === 0 && <div style={{ fontSize: 12, color: '#64748B' }}>Нет данных за период.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {topTasks.map((t, i) => {
            const dept = getDept(t.dept);
            const company = getCompany(t.company);
            return (
              <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: i < topTasks.length - 1 ? '1px solid rgba(15,23,42,0.05)' : 'none' }}>
                <span className="mono" style={{ fontSize: 11, color: '#94A3B8', minWidth: 22, fontWeight: 500 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 13, color: '#0F172A', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                {dept && <span style={S.badge(dept.color)}>{dept.name}</span>}
                {company && <span style={S.badge(company.color)}>{company.short}</span>}
                <span className="mono" style={{ fontSize: 12, color: '#0284C7', fontWeight: 600, minWidth: 55, textAlign: 'right' }}>{fmtHours(t.rangeTime)} ч</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ===== Главный компонент =====

function App() {
  const [tab, setTab] = useState('kanban');
  const [tasks, setTasks] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [loaded, setLoaded] = useState(false);

  // load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        setTasks(Array.isArray(data.tasks) ? data.tasks : []);
        setActiveId(data.activeTimerId || null);
      }
    } catch (e) { console.warn('load failed', e); }
    setLoaded(true);
  }, []);

  // save to localStorage
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tasks, activeTimerId: activeId, timerStartedAt: null
      }));
    } catch (e) { console.warn('save failed', e); }
  }, [tasks, activeId, loaded]);

  // ticking clock for running timers
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const reset = () => {
    if (window.confirm('Удалить все задачи и данные?')) {
      setTasks([]);
      setActiveId(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <div style={S.app}>
      <div style={S.header}>
        <div style={S.logo}>Дела</div>
        <div style={S.tabs}>
          <button onClick={() => setTab('kanban')} style={S.tab(tab === 'kanban')}>Канбан</button>
          <button onClick={() => setTab('reports')} style={S.tab(tab === 'reports')}>Отчёты</button>
        </div>
        <button onClick={reset} style={S.resetBtn} className="btn-hover">Сбросить</button>
      </div>
      <div style={S.container}>
        {tab === 'kanban'
          ? <KanbanView tasks={tasks} activeId={activeId} setTasks={setTasks} setActiveId={setActiveId} now={now} />
          : <ReportsView tasks={tasks} />}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
