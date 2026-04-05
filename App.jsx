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
  { id: 'sales',     name: 'Продажи',     color: '#A855F7' },
  { id: 'marketing', name: 'Маркетинг',   color: '#CA8A04' },
  { id: 'ops',       name: 'Операционка', color: '#92400E' },
  { id: 'personal',  name: 'Личное',      color: '#0EA5E9' },
];

const COMPANIES = [
  { id: 'kg', name: 'КиберГусли', short: 'КГ', color: '#2563EB' },
  { id: 'kc', name: 'КЦ',         short: 'КЦ', color: '#DC2626' },
  { id: 'pf', name: 'ПФ',         short: 'ПФ', color: '#059669' },
];

const DEPT_IDS = ['sales', 'marketing', 'ops', 'personal'];
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

function TaskCard({ task, isActive, onStart, onPause, onDelete, onOpen, onDragStart, now }) {
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
        <button className="btn-hover" onClick={onDelete} title="Удалить"
          style={{ padding: '4px 8px', fontSize: 12, color: '#64748B', borderRadius: 5, border: '1px solid rgba(15,23,42,0.1)', background: '#FFFFFF', marginLeft: 'auto' }}>×</button>
      </div>

      <div className="mono" style={{ fontSize: 10, color: '#94A3B8', marginTop: 8 }}>
        {fmtDate(task.createdAt)}
      </div>
    </div>
  );
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

const fmtFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
};

function FileAttach({ files, onChange }) {
  const inputRef = useRef(null);

  const handleSelect = async (e) => {
    const picked = Array.from(e.target.files || []);
    const accepted = [];
    for (const f of picked) {
      if (f.size > MAX_FILE_SIZE) {
        alert(`Файл "${f.name}" слишком большой (${fmtFileSize(f.size)}). Максимум 2 МБ.`);
        continue;
      }
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(f);
      });
      accepted.push({ id: newId(), name: f.name, type: f.type, size: f.size, dataUrl });
    }
    if (accepted.length) onChange([...files, ...accepted]);
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeFile = (id) => onChange(files.filter(f => f.id !== id));

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: files.length > 0 ? 6 : 0 }}>
        {files.map(f => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#FFFFFF', border: '1px solid rgba(15,23,42,0.08)', borderRadius: 6 }}>
            <span style={{ fontSize: 14 }}>📎</span>
            <a href={f.dataUrl} download={f.name} style={{ fontSize: 12, color: '#0284C7', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>{f.name}</a>
            <span className="mono" style={{ fontSize: 10, color: '#94A3B8' }}>{fmtFileSize(f.size)}</span>
            <button onClick={() => removeFile(f.id)} className="btn-hover"
              style={{ fontSize: 12, color: '#64748B', padding: '2px 6px', borderRadius: 4 }}>×</button>
          </div>
        ))}
      </div>
      <input ref={inputRef} type="file" multiple onChange={handleSelect} style={{ display: 'none' }} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="btn-hover"
        style={{ padding: '6px 12px', fontSize: 11, fontWeight: 500, borderRadius: 5, color: '#475569', border: '1px dashed rgba(15,23,42,0.2)', background: '#FFFFFF' }}
      >+ Прикрепить файл</button>
    </div>
  );
}

function TaskModal({ task, onClose, onUpdate, onComplete, now }) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || '');
  const [estHours, setEstHours] = useState(task.estimateMinutes ? String(Math.floor(task.estimateMinutes / 60)) : '');
  const [estMins, setEstMins] = useState(task.estimateMinutes ? String(task.estimateMinutes % 60) : '');
  const [result, setResult] = useState(task.result || '');
  const [descriptionFiles, setDescriptionFiles] = useState(task.descriptionFiles || []);
  const [resultFiles, setResultFiles] = useState(task.resultFiles || []);
  const [dept, setDept] = useState(task.dept);
  const [company, setCompany] = useState(task.company);

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description || '');
    setEstHours(task.estimateMinutes ? String(Math.floor(task.estimateMinutes / 60)) : '');
    setEstMins(task.estimateMinutes ? String(task.estimateMinutes % 60) : '');
    setResult(task.result || '');
    setDescriptionFiles(task.descriptionFiles || []);
    setResultFiles(task.resultFiles || []);
    setDept(task.dept);
    setCompany(task.company);
  }, [task.id]);

  const startedAt = task.sessions.length > 0 ? Math.min(...task.sessions.map(s => s.start)) : null;
  const total = taskTotal(task, now);
  const status = taskStatus(task);
  const save = () => {
    const h = parseInt(estHours, 10) || 0;
    const m = parseInt(estMins, 10) || 0;
    const mins = h * 60 + m;
    const patch = {
      title: title.trim() || task.title,
      description,
      estimateMinutes: mins > 0 ? mins : null,
      result,
      descriptionFiles,
      resultFiles,
      dept,
      company,
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
          <button onClick={onClose} className="btn-hover"
            style={{ marginLeft: 'auto', fontSize: 18, color: '#64748B', padding: '2px 8px', borderRadius: 5 }}>×</button>
        </div>

        {/* title */}
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Название задачи"
          style={{ ...S.input, fontSize: 20, fontWeight: 600, padding: '10px 12px', marginBottom: 16 }}
        />

        {/* dept + company chips */}
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div>
            {label('Отдел')}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {DEPTS.map(d => (
                <button key={d.id} onClick={() => setDept(dept === d.id ? null : d.id)} style={S.chip(dept === d.id, d.color)}>{d.name}</button>
              ))}
            </div>
          </div>
          <div>
            {label('Компания')}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {COMPANIES.map(c => (
                <button key={c.id} onClick={() => setCompany(company === c.id ? null : c.id)} style={S.chip(company === c.id, c.color)}>{c.name}</button>
              ))}
            </div>
          </div>
        </div>

        {/* description */}
        <div style={{ marginBottom: 16 }}>
          {label('Описание')}
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="В чём состоит задача — подробно..."
            rows={5}
            style={{ ...S.input, resize: 'vertical', minHeight: 80, fontFamily: 'DM Sans', lineHeight: 1.5, marginBottom: 8 }}
          />
          <FileAttach files={descriptionFiles} onChange={setDescriptionFiles} />
        </div>

        {/* meta grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
          <div>
            {label('Создана')}
            <div className="mono" style={{ fontSize: 13, color: '#0F172A' }}>{fmtDateTime(task.createdAt)}</div>
          </div>
          <div>
            {label('Займёт (предп.)')}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="number" min="0"
                value={estHours}
                onChange={e => setEstHours(e.target.value)}
                placeholder="0"
                style={{ ...S.input, padding: '6px 10px', fontSize: 13, width: 60 }}
              />
              <span style={{ fontSize: 11, color: '#64748B' }}>ч</span>
              <input
                type="number" min="0" max="59"
                value={estMins}
                onChange={e => setEstMins(e.target.value)}
                placeholder="0"
                style={{ ...S.input, padding: '6px 10px', fontSize: 13, width: 60 }}
              />
              <span style={{ fontSize: 11, color: '#64748B' }}>мин</span>
            </div>
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
            style={{ ...S.input, resize: 'vertical', minHeight: 60, fontFamily: 'DM Sans', lineHeight: 1.5, marginBottom: 8 }}
          />
          <FileAttach files={resultFiles} onChange={setResultFiles} />
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
  const [newDesc, setNewDesc] = useState('');
  const [newEstH, setNewEstH] = useState('');
  const [newEstM, setNewEstM] = useState('');
  const [newDept, setNewDept] = useState(null);
  const [newCompany, setNewCompany] = useState(null);

  const resetForm = () => {
    setNewTitle(''); setNewDesc(''); setNewEstH(''); setNewEstM('');
    setNewDept(null); setNewCompany(null); setAdding(false);
  };

  const submitNew = () => {
    const t = newTitle.trim();
    if (!t) return;
    const h = parseInt(newEstH, 10) || 0;
    const m = parseInt(newEstM, 10) || 0;
    const mins = h * 60 + m;
    onAddTask(column.id, {
      title: t,
      description: newDesc,
      estimateMinutes: mins > 0 ? mins : null,
      dept: newDept,
      company: newCompany,
    });
    resetForm();
  };
  const total = tasks.reduce((s, t) => s + taskTotal(t, now), 0);
  const plannedMin = tasks.reduce((s, t) => s + (t.estimateMinutes || 0), 0);
  const totalInColumn = allTasks.filter(t => t.column === column.id).length;
  const hiddenCount = totalInColumn - tasks.length;
  const showPlanned = column.id !== 'done';

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
      <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: `2px solid ${column.color}55` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: column.color }} />
          <div style={{ fontSize: 13, fontWeight: 600, color: '#334155', flex: 1 }}>{column.title}</div>
          <span className="mono" style={{ fontSize: 10, color: '#64748B', fontWeight: 500 }}>
            {totalInColumn !== tasks.length ? `${tasks.length}/${totalInColumn}` : tasks.length}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6, flexWrap: 'wrap' }}>
          {showPlanned ? (
            <span className="mono" style={{ fontSize: 11, color: '#0F172A', fontWeight: 600 }} title="Запланировано по оценкам задач">
              📋 {fmtDuration(plannedMin * 60000)}
            </span>
          ) : (
            <span className="mono" style={{ fontSize: 11, color: '#0F172A', fontWeight: 600 }} title="Фактически потрачено">
              Σ {fmtDuration(total)}
            </span>
          )}
        </div>
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
            onDelete={() => onTaskAction('delete', t.id)}
            onOpen={() => onOpenTask(t.id)}
          />
        ))}
      </div>

      {adding ? (
        <div style={{ marginTop: 6, padding: 10, background: '#FFFFFF', borderRadius: 8, border: '1px solid rgba(15,23,42,0.1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            autoFocus value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') resetForm(); if (e.key === 'Enter') submitNew(); }}
            placeholder="Название задачи *"
            style={{ ...S.input, padding: '7px 10px', fontSize: 13, fontWeight: 500 }}
          />
          <textarea
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Описание..."
            rows={2}
            style={{ ...S.input, padding: '6px 10px', fontSize: 12, resize: 'vertical', minHeight: 40, fontFamily: 'DM Sans', lineHeight: 1.4 }}
          />
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#64748B', fontWeight: 600, marginRight: 2 }}>ПЛАН</span>
            <input type="number" min="0" value={newEstH} onChange={e => setNewEstH(e.target.value)} placeholder="0"
              style={{ ...S.input, padding: '4px 6px', fontSize: 12, width: 44 }} />
            <span style={{ fontSize: 10, color: '#64748B' }}>ч</span>
            <input type="number" min="0" max="59" value={newEstM} onChange={e => setNewEstM(e.target.value)} placeholder="0"
              style={{ ...S.input, padding: '4px 6px', fontSize: 12, width: 44 }} />
            <span style={{ fontSize: 10, color: '#64748B' }}>мин</span>
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 4 }}>ОТДЕЛ</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {DEPTS.map(d => (
                <button key={d.id} onClick={() => setNewDept(newDept === d.id ? null : d.id)}
                  style={{ ...S.chip(newDept === d.id, d.color), padding: '3px 7px', fontSize: 10 }}>{d.name}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: '#64748B', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 4 }}>КОМПАНИЯ</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {COMPANIES.map(c => (
                <button key={c.id} onClick={() => setNewCompany(newCompany === c.id ? null : c.id)}
                  style={{ ...S.chip(newCompany === c.id, c.color), padding: '3px 7px', fontSize: 10 }}>{c.short}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
            <button onClick={submitNew} className="btn-hover"
              style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 5, background: '#0284C7', color: '#FFFFFF', flex: 1 }}>
              Создать
            </button>
            <button onClick={resetForm} className="btn-hover"
              style={{ padding: '6px 12px', fontSize: 11, fontWeight: 500, borderRadius: 5, color: '#64748B', border: '1px solid rgba(15,23,42,0.12)', background: '#FFFFFF' }}>
              Отмена
            </button>
          </div>
        </div>
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
      description: '', estimateMinutes: null, completedAt: null, result: '',
      descriptionFiles: [], resultFiles: []
    }]);
  };

  const addTaskToColumn = (columnId, fields) => {
    setTasks(prev => [...prev, {
      id: newId(),
      title: fields.title,
      column: columnId,
      dept: fields.dept || null,
      company: fields.company || null,
      sessions: [], createdAt: Date.now(),
      description: fields.description || '',
      estimateMinutes: fields.estimateMinutes || null,
      completedAt: null, result: '',
      descriptionFiles: [], resultFiles: []
    }]);
  };

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
    const map = { sales: 0, marketing: 0, ops: 0, personal: 0, none: 0 };
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

// ===== 12 недель =====

const WEEKPLAN_STORAGE_KEY = 'weekplan-v1';
const TOTAL_DAYS = 84;
const TOTAL_WEEKS = 12;

// date utils
const toISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const parseISODate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDaysISO = (iso, days) => {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};
const todayISO = () => toISODate(new Date());
const dayOfWeek = (iso) => parseISODate(iso).getDay(); // 0=вс, 6=сб
const isWeekendDay = (iso) => { const d = dayOfWeek(iso); return d === 0 || d === 6; };

const MONTH_NAMES_RU = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
const fmtDayShort = (iso) => {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTH_NAMES_RU[d.getMonth()]}`;
};

const extractNumber = (s) => {
  if (!s) return null;
  const m = String(s).replace(/\s+/g, '').replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

const computeProgress = (start, target, current) => {
  const a = extractNumber(start);
  const b = extractNumber(target);
  const c = extractNumber(current);
  if (a == null || b == null || c == null) return null;
  if (a === b) return c >= b ? 100 : 0;
  const pct = ((c - a) / (b - a)) * 100;
  return Math.max(0, Math.min(100, pct));
};

// compute minutes tracked on tasks matching dept/company filters on a given ISO day
const minutesOnDay = (tasks, iso, deptFilter, companyFilter) => {
  const dayStart = parseISODate(iso).getTime();
  const dayEnd = dayStart + 86400000;
  let totalMs = 0;
  for (const t of tasks) {
    if (deptFilter && t.dept !== deptFilter) continue;
    if (companyFilter && t.company !== companyFilter) continue;
    totalMs += taskTotalInRange(t, dayStart, dayEnd);
  }
  return Math.floor(totalMs / 60000);
};

// effective cell value: manual entry wins, else auto if tactic has autoMinutes+filters
const getEffectiveCell = (tactic, iso, tasks) => {
  const manual = tactic.completions[iso];
  if (manual === true || manual === false) return { value: manual, isAuto: false };
  const need = tactic.autoMinutes;
  if (need && need > 0) {
    const got = minutesOnDay(tasks, iso, tactic.autoDept, tactic.autoCompany);
    if (got >= need) return { value: true, isAuto: true, got, need };
    return { value: null, isAuto: true, got, need };
  }
  return { value: null, isAuto: false };
};

function ProgressBar({ value, color = '#0284C7' }) {
  return (
    <div style={{ height: 8, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
    </div>
  );
}

function GoalCard({ goal, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(goal.currentValue || '');
  const pct = computeProgress(goal.startValue, goal.targetValue, goal.currentValue);
  const company = getCompany(goal.company);
  const progressColor = pct != null && pct >= 85 ? '#059669' : pct != null && pct >= 50 ? '#0284C7' : '#CA8A04';

  const save = () => { onUpdate({ currentValue: val }); setEditing(false); };

  return (
    <div style={{ ...S.card, marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span className="mono" style={{ fontSize: 11, color: '#64748B', fontWeight: 600 }}>#{goal.number}</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#0F172A', flex: 1, minWidth: 200 }}>{goal.title || 'Без названия'}</span>
        {company && <span style={S.badge(company.color)}>{company.short}</span>}
      </div>
      <div className="mono" style={{ fontSize: 12, color: '#475569', marginBottom: 8, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>Старт: <b style={{ color: '#0F172A' }}>{goal.startValue || '—'}</b></span>
        <span style={{ color: '#94A3B8' }}>→</span>
        <span>Цель: <b style={{ color: '#0F172A' }}>{goal.targetValue || '—'}</b></span>
        <span style={{ color: '#94A3B8' }}>→</span>
        <span>Сейчас: <b style={{ color: progressColor }}>{goal.currentValue || '—'}</b></span>
      </div>
      {pct != null && (
        <div style={{ marginBottom: 8 }}>
          <ProgressBar value={pct} color={progressColor} />
          <div className="mono" style={{ fontSize: 11, color: progressColor, fontWeight: 600, marginTop: 4, textAlign: 'right' }}>{pct.toFixed(1)}%</div>
        </div>
      )}
      {editing ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input autoFocus value={val} onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="Новое текущее значение"
            style={{ ...S.input, padding: '6px 10px', fontSize: 13 }} />
          <button onClick={save} className="btn-hover"
            style={{ padding: '6px 12px', fontSize: 11, fontWeight: 600, borderRadius: 5, background: '#0284C7', color: '#FFFFFF' }}>Сохранить</button>
          <button onClick={() => setEditing(false)} className="btn-hover"
            style={{ padding: '6px 10px', fontSize: 11, color: '#64748B', borderRadius: 5, border: '1px solid rgba(15,23,42,0.12)' }}>×</button>
        </div>
      ) : (
        <button onClick={() => { setVal(goal.currentValue || ''); setEditing(true); }} className="btn-hover"
          style={{ padding: '5px 12px', fontSize: 11, fontWeight: 500, borderRadius: 5, color: '#475569', border: '1px solid rgba(15,23,42,0.12)', background: '#FFFFFF' }}>Обновить</button>
      )}
    </div>
  );
}

function TrackingTable({ plan, onToggleCell, tasks }) {
  const today = todayISO();
  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i < TOTAL_DAYS; i++) arr.push(addDaysISO(plan.startDate, i));
    return arr;
  }, [plan.startDate]);

  const cellSize = 28;

  const cycleCell = (current) => {
    if (current === true) return false; // ✓ → ✗
    if (current === false) return null; // ✗ → empty
    return true; // empty → ✓
  };

  const weekTotals = useMemo(() => {
    const totals = [];
    for (let w = 0; w < TOTAL_WEEKS; w++) {
      let completed = 0, expected = 0;
      const weekStart = w * 7;
      for (let i = 0; i < 7; i++) {
        const dayIdx = weekStart + i;
        if (dayIdx >= TOTAL_DAYS) break;
        const iso = days[dayIdx];
        const weekend = isWeekendDay(iso);
        const isPast = iso <= today;
        if (!isPast) continue;
        plan.goals.forEach(goal => {
          goal.tactics.forEach(t => {
            if (t.frequency === 'weekday' && weekend) return;
            expected += 1;
            const eff = getEffectiveCell(t, iso, tasks);
            if (eff.value === true) completed += 1;
          });
        });
      }
      const pct = expected > 0 ? (completed / expected) * 100 : null;
      totals.push({ completed, expected, pct });
    }
    return totals;
  }, [plan, days, today, tasks]);

  const weekColor = (pct) => {
    if (pct == null) return '#94A3B8';
    if (pct >= 85) return '#059669';
    if (pct >= 60) return '#CA8A04';
    return '#DC2626';
  };

  const stickyBg = '#F1F5F9';
  const stickyStyle = { background: stickyBg, position: 'sticky', zIndex: 2 };

  const renderGoalRows = () => {
    const rows = [];
    plan.goals.forEach(goal => {
      if (goal.tactics.length === 0) return;
      goal.tactics.forEach((t, tIdx) => {
        rows.push({ goal, tactic: t, isFirst: tIdx === 0, tacticCount: goal.tactics.length });
      });
    });
    return rows;
  };
  const rows = renderGoalRows();

  return (
    <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="mono" style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ ...stickyStyle, left: 0, width: 30, padding: 6, borderBottom: '1px solid rgba(15,23,42,0.1)', fontWeight: 600, color: '#64748B' }}>№</th>
              <th style={{ ...stickyStyle, left: 30, width: 180, padding: 6, borderBottom: '1px solid rgba(15,23,42,0.1)', fontWeight: 600, color: '#64748B', textAlign: 'left' }}>Цель</th>
              <th style={{ ...stickyStyle, left: 210, width: 150, padding: 6, borderBottom: '1px solid rgba(15,23,42,0.1)', fontWeight: 600, color: '#64748B', textAlign: 'left' }}>Тактика</th>
              {days.map((iso, i) => {
                const d = parseISODate(iso);
                const isToday = iso === today;
                const weekend = isWeekendDay(iso);
                const weekStart = i % 7 === 0;
                return (
                  <th key={iso}
                    style={{
                      minWidth: cellSize, width: cellSize, height: 36, padding: 0,
                      borderBottom: '1px solid rgba(15,23,42,0.1)',
                      borderLeft: weekStart ? '2px solid rgba(15,23,42,0.15)' : '1px solid rgba(15,23,42,0.04)',
                      background: isToday ? '#FEF3C7' : (weekend ? '#E2E8F0' : '#F8FAFC'),
                      fontSize: 9, fontWeight: 500, color: isToday ? '#92400E' : '#64748B',
                      lineHeight: 1.1
                    }}
                    title={fmtDayShort(iso)}
                  >
                    <div style={{ fontSize: 8, color: '#94A3B8' }}>{MONTH_NAMES_RU[d.getMonth()]}</div>
                    <div style={{ fontWeight: 600, color: isToday ? '#92400E' : '#334155' }}>{d.getDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ goal, tactic, isFirst, tacticCount }, rIdx) => (
              <tr key={`${goal.id}-${tactic.id}`}>
                <td style={{ ...stickyStyle, left: 0, padding: 6, borderBottom: '1px solid rgba(15,23,42,0.05)', textAlign: 'center', fontWeight: 600, color: '#64748B' }}>
                  {isFirst ? goal.number : ''}
                </td>
                <td style={{ ...stickyStyle, left: 30, padding: 6, borderBottom: '1px solid rgba(15,23,42,0.05)', color: '#0F172A', fontWeight: isFirst ? 600 : 400, fontSize: 11, fontFamily: 'DM Sans' }}>
                  {isFirst ? goal.title : ''}
                </td>
                <td style={{ ...stickyStyle, left: 210, padding: 6, borderBottom: '1px solid rgba(15,23,42,0.05)', color: '#334155', fontSize: 11, fontFamily: 'DM Sans' }}>
                  {tactic.title}
                  <span style={{ fontSize: 9, color: '#94A3B8', marginLeft: 4 }}>
                    {tactic.frequency === 'weekday' ? '(5/7)' : '(7/7)'}
                  </span>
                </td>
                {days.map((iso, i) => {
                  const weekend = isWeekendDay(iso);
                  const isToday = iso === today;
                  const isFuture = iso > today;
                  const weekStart = i % 7 === 0;
                  const manualVal = tactic.completions[iso];
                  const blockedWeekend = tactic.frequency === 'weekday' && weekend;
                  const clickable = !isFuture && !blockedWeekend;
                  const eff = isFuture ? { value: null, isAuto: false } : getEffectiveCell(tactic, iso, tasks);

                  let bg = '#FFFFFF';
                  let content = '';
                  let color = '#0F172A';
                  if (isFuture) bg = '#F1F5F9';
                  else if (blockedWeekend) bg = '#E5E7EB';
                  else if (weekend) bg = '#F8FAFC';

                  if (manualVal === true) { content = '✓'; color = '#059669'; bg = '#D1FAE5'; }
                  else if (manualVal === false) { content = '✗'; color = '#DC2626'; bg = '#FEE2E2'; }
                  else if (eff.isAuto && eff.value === true) { content = '✓'; color = '#059669'; bg = '#ECFDF5'; }

                  const isAutoMark = manualVal == null && eff.isAuto && eff.value === true;
                  const border = isToday ? '2px solid #F59E0B' : (weekStart ? '2px solid rgba(15,23,42,0.15)' : '1px solid rgba(15,23,42,0.04)');
                  const titleAttr = tactic.autoMinutes && !isFuture && !blockedWeekend
                    ? `Набрано ${eff.got || 0} мин из ${tactic.autoMinutes} мин нужно${isAutoMark ? ' (авто)' : ''}`
                    : undefined;

                  return (
                    <td key={iso}
                      onClick={clickable ? () => onToggleCell(goal.id, tactic.id, iso, cycleCell(manualVal)) : undefined}
                      title={titleAttr}
                      style={{
                        width: cellSize, height: cellSize, padding: 0, textAlign: 'center',
                        borderBottom: '1px solid rgba(15,23,42,0.04)',
                        borderLeft: border,
                        background: bg, color, fontWeight: 700, fontSize: 13,
                        cursor: clickable ? 'pointer' : 'default',
                        userSelect: 'none',
                        opacity: isAutoMark ? 0.7 : 1,
                      }}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
            {/* Week totals row */}
            <tr>
              <td colSpan={3} style={{ ...stickyStyle, left: 0, padding: '8px 6px', borderTop: '2px solid rgba(15,23,42,0.1)', color: '#64748B', fontWeight: 600, textAlign: 'right', fontSize: 10, fontFamily: 'DM Sans' }}>
                ИТОГО ПО НЕДЕЛЕ
              </td>
              {weekTotals.map((wt, w) => (
                <td key={w} colSpan={7} style={{
                  borderTop: '2px solid rgba(15,23,42,0.1)',
                  borderLeft: '2px solid rgba(15,23,42,0.15)',
                  padding: '8px 4px', textAlign: 'center',
                  background: wt.pct != null ? `${weekColor(wt.pct)}18` : '#F8FAFC',
                  color: weekColor(wt.pct), fontWeight: 700, fontSize: 11
                }}>
                  {wt.pct != null ? `${wt.pct.toFixed(0)}%` : '—'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlanSettings({ plan, onSave, onCancel, onDelete }) {
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(plan)));

  const updatePlan = (patch) => setDraft(p => ({ ...p, ...patch }));
  const updateGoal = (gid, patch) => setDraft(p => ({
    ...p, goals: p.goals.map(g => g.id === gid ? { ...g, ...patch } : g)
  }));
  const addGoal = () => setDraft(p => ({
    ...p, goals: [...p.goals, {
      id: newId(), number: p.goals.length + 1, title: '', company: null,
      startValue: '', targetValue: '', currentValue: '', tactics: []
    }]
  }));
  const removeGoal = (gid) => {
    if (!window.confirm('Удалить цель?')) return;
    setDraft(p => ({
      ...p,
      goals: p.goals.filter(g => g.id !== gid).map((g, i) => ({ ...g, number: i + 1 }))
    }));
  };
  const moveGoal = (gid, dir) => setDraft(p => {
    const i = p.goals.findIndex(g => g.id === gid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= p.goals.length) return p;
    const goals = [...p.goals];
    [goals[i], goals[j]] = [goals[j], goals[i]];
    return { ...p, goals: goals.map((g, idx) => ({ ...g, number: idx + 1 })) };
  });
  const addTactic = (gid) => updateGoal(gid, {
    tactics: [...draft.goals.find(g => g.id === gid).tactics, { id: newId(), title: '', frequency: 'daily', completions: {} }]
  });
  const updateTactic = (gid, tid, patch) => {
    const goal = draft.goals.find(g => g.id === gid);
    updateGoal(gid, { tactics: goal.tactics.map(t => t.id === tid ? { ...t, ...patch } : t) });
  };
  const removeTactic = (gid, tid) => {
    const goal = draft.goals.find(g => g.id === gid);
    updateGoal(gid, { tactics: goal.tactics.filter(t => t.id !== tid) });
  };

  // compute endDate whenever startDate changes
  useEffect(() => {
    const end = addDaysISO(draft.startDate, TOTAL_DAYS - 1);
    if (end !== draft.endDate) setDraft(p => ({ ...p, endDate: end }));
  }, [draft.startDate]);

  const label = (text) => (
    <div style={{ fontSize: 10, color: '#64748B', fontWeight: 600, letterSpacing: '0.05em', marginBottom: 4, textTransform: 'uppercase' }}>{text}</div>
  );

  return (
    <div>
      <div style={{ ...S.card, marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 8 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            {label('Название плана')}
            <input value={draft.title} onChange={e => updatePlan({ title: e.target.value })}
              placeholder="12 недель — весна 2026" style={S.input} />
          </div>
          <div>
            {label('Дата начала')}
            <input type="date" value={draft.startDate}
              onChange={e => updatePlan({ startDate: e.target.value })}
              style={{ ...S.input, width: 160 }} />
          </div>
          <div>
            {label('Дата окончания (авто)')}
            <div className="mono" style={{ fontSize: 13, color: '#475569', padding: '8px 0' }}>
              {fmtDayShort(draft.endDate)} ({draft.endDate})
            </div>
          </div>
        </div>
      </div>

      {draft.goals.map((goal, gi) => (
        <div key={goal.id} style={{ ...S.card, marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span className="mono" style={{ fontSize: 12, color: '#64748B', fontWeight: 600, minWidth: 24 }}>#{goal.number}</span>
            <input value={goal.title} onChange={e => updateGoal(goal.id, { title: e.target.value })}
              placeholder="Название цели (например, Похудение до 59 кг)"
              style={{ ...S.input, fontSize: 15, fontWeight: 600, flex: 1 }} />
            <button onClick={() => moveGoal(goal.id, -1)} className="btn-hover" disabled={gi === 0}
              style={{ padding: '6px 8px', fontSize: 11, color: gi === 0 ? '#CBD5E1' : '#64748B', borderRadius: 5, border: '1px solid rgba(15,23,42,0.1)', background: '#FFFFFF' }}>↑</button>
            <button onClick={() => moveGoal(goal.id, 1)} className="btn-hover" disabled={gi === draft.goals.length - 1}
              style={{ padding: '6px 8px', fontSize: 11, color: gi === draft.goals.length - 1 ? '#CBD5E1' : '#64748B', borderRadius: 5, border: '1px solid rgba(15,23,42,0.1)', background: '#FFFFFF' }}>↓</button>
            <button onClick={() => removeGoal(goal.id)} className="btn-hover"
              style={{ padding: '6px 10px', fontSize: 11, color: '#DC2626', borderRadius: 5, border: '1px solid rgba(220,38,38,0.3)', background: '#FFFFFF' }}>Удалить</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
            <div>
              {label('Компания')}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button onClick={() => updateGoal(goal.id, { company: null })} style={S.chip(goal.company === null, '#64748B')}>—</button>
                {COMPANIES.map(c => (
                  <button key={c.id} onClick={() => updateGoal(goal.id, { company: goal.company === c.id ? null : c.id })} style={S.chip(goal.company === c.id, c.color)}>{c.short}</button>
                ))}
              </div>
            </div>
            <div>
              {label('Начальное значение')}
              <input value={goal.startValue} onChange={e => updateGoal(goal.id, { startValue: e.target.value })}
                placeholder="67 кг" style={{ ...S.input, padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              {label('Целевое значение')}
              <input value={goal.targetValue} onChange={e => updateGoal(goal.id, { targetValue: e.target.value })}
                placeholder="59 кг" style={{ ...S.input, padding: '6px 10px', fontSize: 13 }} />
            </div>
            <div>
              {label('Текущее значение')}
              <input value={goal.currentValue} onChange={e => updateGoal(goal.id, { currentValue: e.target.value })}
                placeholder="64 кг" style={{ ...S.input, padding: '6px 10px', fontSize: 13 }} />
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(15,23,42,0.06)', paddingTop: 10 }}>
            {label('Тактики')}
            {goal.tactics.map(t => (
              <div key={t.id} style={{ marginBottom: 10, padding: 8, background: '#F8FAFC', borderRadius: 6, border: '1px solid rgba(15,23,42,0.05)' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                  <input value={t.title} onChange={e => updateTactic(goal.id, t.id, { title: e.target.value })}
                    placeholder="Название тактики (например, Зарядка)"
                    style={{ ...S.input, padding: '6px 10px', fontSize: 13, flex: 1, minWidth: 200 }} />
                  <button onClick={() => updateTactic(goal.id, t.id, { frequency: t.frequency === 'daily' ? 'weekday' : 'daily' })} className="btn-hover"
                    style={{ padding: '6px 10px', fontSize: 11, fontWeight: 500, borderRadius: 5, color: '#475569', border: '1px solid rgba(15,23,42,0.12)', background: '#FFFFFF', fontFamily: 'JetBrains Mono' }}>
                    {t.frequency === 'daily' ? '7/7 ежедневно' : '5/7 по будням'}
                  </button>
                  <button onClick={() => removeTactic(goal.id, t.id)} className="btn-hover"
                    style={{ padding: '6px 10px', fontSize: 11, color: '#64748B', borderRadius: 5, border: '1px solid rgba(15,23,42,0.1)', background: '#FFFFFF' }}>×</button>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 11 }}>
                  <span style={{ color: '#64748B', fontWeight: 600, letterSpacing: '0.03em' }}>АВТО ✓ ЕСЛИ:</span>
                  <input
                    type="number" min="0"
                    value={t.autoMinutes || ''}
                    onChange={e => updateTactic(goal.id, t.id, { autoMinutes: e.target.value ? parseInt(e.target.value, 10) : null })}
                    placeholder="0"
                    style={{ ...S.input, padding: '4px 8px', fontSize: 12, width: 60 }} />
                  <span style={{ color: '#64748B' }}>мин на задачах</span>
                  <select value={t.autoDept || ''} onChange={e => updateTactic(goal.id, t.id, { autoDept: e.target.value || null })}
                    style={{ ...S.input, padding: '4px 8px', fontSize: 12, width: 'auto' }}>
                    <option value="">любой отдел</option>
                    {DEPTS.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <select value={t.autoCompany || ''} onChange={e => updateTactic(goal.id, t.id, { autoCompany: e.target.value || null })}
                    style={{ ...S.input, padding: '4px 8px', fontSize: 12, width: 'auto' }}>
                    <option value="">любая компания</option>
                    {COMPANIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            ))}
            <button onClick={() => addTactic(goal.id)} className="btn-hover"
              style={{ padding: '6px 12px', fontSize: 11, fontWeight: 500, borderRadius: 5, color: '#475569', border: '1px dashed rgba(15,23,42,0.2)', background: '#FFFFFF', marginTop: 4 }}>
              + Добавить тактику
            </button>
          </div>
        </div>
      ))}

      <button onClick={addGoal} className="btn-hover"
        style={{ padding: '8px 14px', fontSize: 12, fontWeight: 500, borderRadius: 6, color: '#475569', border: '1px dashed rgba(15,23,42,0.2)', background: '#FFFFFF', marginBottom: 16 }}>
        + Добавить цель
      </button>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => onSave(draft)} className="btn-hover"
          style={{ padding: '9px 18px', fontSize: 13, fontWeight: 600, borderRadius: 6, background: '#0284C7', color: '#FFFFFF' }}>
          Сохранить план
        </button>
        <button onClick={onCancel} className="btn-hover"
          style={{ padding: '9px 18px', fontSize: 13, fontWeight: 500, borderRadius: 6, color: '#64748B', border: '1px solid rgba(15,23,42,0.12)' }}>
          Отмена
        </button>
        {onDelete && (
          <button onClick={() => { if (window.confirm('Удалить этот план?')) onDelete(); }} className="btn-hover"
            style={{ padding: '9px 18px', fontSize: 13, fontWeight: 500, borderRadius: 6, color: '#DC2626', border: '1px solid rgba(220,38,38,0.3)', background: '#FFFFFF', marginLeft: 'auto' }}>
            Удалить план
          </button>
        )}
      </div>
    </div>
  );
}

function WeekPlanView({ plans, activePlanId, setPlans, setActivePlanId, tasks }) {
  const [settingsMode, setSettingsMode] = useState(false);

  const activePlan = plans.find(p => p.id === activePlanId) || null;

  const createNewPlan = () => {
    const start = todayISO();
    const newPlan = {
      id: newId(),
      title: '12 недель',
      startDate: start,
      endDate: addDaysISO(start, TOTAL_DAYS - 1),
      goals: []
    };
    setPlans(prev => [...prev, newPlan]);
    setActivePlanId(newPlan.id);
    setSettingsMode(true);
  };

  const savePlan = (updated) => {
    setPlans(prev => prev.map(p => p.id === updated.id ? updated : p));
    setSettingsMode(false);
  };

  const deletePlan = () => {
    setPlans(prev => {
      const next = prev.filter(p => p.id !== activePlanId);
      setActivePlanId(next.length > 0 ? next[0].id : null);
      return next;
    });
    setSettingsMode(false);
  };

  const updateGoal = (goalId, patch) => {
    setPlans(prev => prev.map(p => p.id !== activePlanId ? p : {
      ...p, goals: p.goals.map(g => g.id === goalId ? { ...g, ...patch } : g)
    }));
  };

  const toggleCell = (goalId, tacticId, iso, value) => {
    setPlans(prev => prev.map(p => {
      if (p.id !== activePlanId) return p;
      return {
        ...p,
        goals: p.goals.map(g => {
          if (g.id !== goalId) return g;
          return {
            ...g,
            tactics: g.tactics.map(t => {
              if (t.id !== tacticId) return t;
              const completions = { ...t.completions };
              if (value === null) delete completions[iso];
              else completions[iso] = value;
              return { ...t, completions };
            })
          };
        })
      };
    }));
  };

  if (plans.length === 0) {
    return (
      <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 15, color: '#334155', marginBottom: 4, fontWeight: 600 }}>У вас нет ни одного плана</div>
        <div style={{ fontSize: 12, color: '#64748B', marginBottom: 16 }}>12 недель фокуса — поставьте цели и тактики</div>
        <button onClick={createNewPlan} className="btn-hover"
          style={{ padding: '10px 20px', fontSize: 13, fontWeight: 600, borderRadius: 6, background: '#0284C7', color: '#FFFFFF' }}>
          Создать первый план
        </button>
      </div>
    );
  }

  if (!activePlan) return null;

  if (settingsMode) {
    return (
      <PlanSettings
        plan={activePlan}
        onSave={savePlan}
        onCancel={() => setSettingsMode(false)}
        onDelete={deletePlan}
      />
    );
  }

  const today = todayISO();
  const daysPassed = Math.max(0, Math.min(TOTAL_DAYS, Math.floor((parseISODate(today) - parseISODate(activePlan.startDate)) / 86400000) + 1));
  const currentWeek = Math.min(TOTAL_WEEKS, Math.max(1, Math.ceil(daysPassed / 7)));

  return (
    <div>
      {/* Header */}
      <div style={{ ...S.card, marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {plans.length > 1 ? (
          <select value={activePlanId} onChange={e => setActivePlanId(e.target.value)}
            style={{ ...S.input, width: 'auto', padding: '6px 10px', fontSize: 14, fontWeight: 600 }}>
            {plans.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{activePlan.title}</div>
        )}
        <div className="mono" style={{ fontSize: 12, color: '#475569' }}>
          {fmtDayShort(activePlan.startDate)} — {fmtDayShort(activePlan.endDate)}
        </div>
        <div className="mono" style={{ fontSize: 12, color: '#0284C7', fontWeight: 600, padding: '4px 10px', background: '#DBEAFE', borderRadius: 5 }}>
          Неделя {currentWeek} из {TOTAL_WEEKS}
        </div>
        <button onClick={createNewPlan} className="btn-hover"
          style={{ padding: '7px 12px', fontSize: 11, fontWeight: 500, borderRadius: 5, color: '#475569', border: '1px solid rgba(15,23,42,0.12)', background: '#FFFFFF', marginLeft: 'auto' }}>
          + Новый план
        </button>
        <button onClick={() => setSettingsMode(true)} className="btn-hover"
          style={{ padding: '7px 14px', fontSize: 12, fontWeight: 500, borderRadius: 5, color: '#0284C7', border: '1px solid rgba(2,132,199,0.3)', background: '#FFFFFF' }}>
          Настроить план
        </button>
      </div>

      {/* Goals */}
      {activePlan.goals.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', padding: 24 }}>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 10 }}>В плане нет целей</div>
          <button onClick={() => setSettingsMode(true)} className="btn-hover"
            style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, borderRadius: 6, background: '#0284C7', color: '#FFFFFF' }}>
            Добавить цели
          </button>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 12 }}>
            {activePlan.goals.map(g => (
              <GoalCard key={g.id} goal={g} onUpdate={(patch) => updateGoal(g.id, patch)} />
            ))}
          </div>
          <TrackingTable plan={activePlan} onToggleCell={toggleCell} tasks={tasks} />
        </>
      )}
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
  const [plans, setPlans] = useState([]);
  const [activePlanId, setActivePlanId] = useState(null);
  const [plansLoaded, setPlansLoaded] = useState(false);

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

    try {
      const raw = localStorage.getItem(WEEKPLAN_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        setPlans(Array.isArray(data.plans) ? data.plans : []);
        setActivePlanId(data.activePlanId || null);
      }
    } catch (e) { console.warn('weekplan load failed', e); }
    setPlansLoaded(true);
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

  // save weekplan to localStorage
  useEffect(() => {
    if (!plansLoaded) return;
    try {
      localStorage.setItem(WEEKPLAN_STORAGE_KEY, JSON.stringify({ plans, activePlanId }));
    } catch (e) { console.warn('weekplan save failed', e); }
  }, [plans, activePlanId, plansLoaded]);

  // ensure activePlanId points to existing plan
  useEffect(() => {
    if (plans.length > 0 && !plans.find(p => p.id === activePlanId)) {
      setActivePlanId(plans[0].id);
    }
  }, [plans, activePlanId]);

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
          <button onClick={() => setTab('weekplan')} style={S.tab(tab === 'weekplan')}>12 недель</button>
        </div>
        <button onClick={reset} style={S.resetBtn} className="btn-hover">Сбросить</button>
      </div>
      <div style={S.container}>
        {tab === 'kanban' && (
          <KanbanView tasks={tasks} activeId={activeId} setTasks={setTasks} setActiveId={setActiveId} now={now} />
        )}
        {tab === 'reports' && <ReportsView tasks={tasks} />}
        {tab === 'weekplan' && (
          <WeekPlanView plans={plans} activePlanId={activePlanId} setPlans={setPlans} setActivePlanId={setActivePlanId} tasks={tasks} />
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
