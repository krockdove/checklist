import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Plus,
  Check,
  X,
  Trash2,
  ChevronDown,
  ChevronRight,
  ChevronsUp,
  ArrowUp,
  ArrowDown,
  BookOpen,
  Layers,
  Archive,
  Stamp,
  Pen,
  ListPlus,
  Hash,
  ClipboardList,
  Copy,
  Pencil,
  Sun,
  Moon,
} from "lucide-react";

const STORAGE_KEY = "novel-workshop:v4";
const LEGACY_KEYS = ["novel-workshop:v3", "novel-workshop:v2"];
const MAX_ACTIVE = 3;
const MAX_CHAPTERS = 500;

const THEMES = {
  light: {
    INK: "#1E2329",
    INK_SOFT: "#4C555F",
    PAPER: "#FAFAFA",
    CARD: "#FFFFFF",
    GRID: "#D8DCE0",
    SEAL: "#DA4A3D",
    NIB: "#3B8DFF",
    FILL: "rgba(59,141,255,0.09)",
    SCRIM: "rgba(30,35,41,0.55)",
    GRAD: "linear-gradient(#3B8DFF, #3B8DFF)",
    STOPS: [[59, 141, 255], [59, 141, 255]],
    WASH: "none",
  },
  dark: {
    INK: "#E7EAED",
    INK_SOFT: "#B7C0CA",
    PAPER: "#15181C",
    CARD: "#1C2026",
    GRID: "#2F353C",
    SEAL: "#DA4A3D",
    NIB: "#3B8DFF",
    FILL: "rgba(59,141,255,0.13)",
    SCRIM: "rgba(0,0,0,0.65)",
    GRAD: "linear-gradient(#3B8DFF, #3B8DFF)",
    STOPS: [[59, 141, 255], [59, 141, 255]],
    WASH: "none",
  },
};

const BASE_STAGES = [
  {
    name: "발상",
    note: "한 문장으로 말할 수 없다면 아직 이야기가 아니다",
    tasks: ["로그라인 한 문장", "주제 문장", "장르와 분량 정하기"],
  },
  {
    name: "세계",
    note: "인물이 딛고 설 바닥 깔기",
    tasks: ["시대와 공간", "규칙과 제약", "핵심 소재 조사"],
  },
  {
    name: "인물",
    note: "욕망과 결핍이 곧 사건이다",
    tasks: ["주인공 욕망·결핍", "대립 인물", "조연 관계도"],
  },
  {
    name: "구성",
    note: "시작과 끝을 먼저 못 박기",
    tasks: ["3막 뼈대", "중간점과 절정", "결말 확정"],
  },
  {
    name: "회차 설계",
    note: "쓰기 전에 길을 다 그려두기",
    tasks: ["총 회차 수 정하기", "회차별 소제목 붙이기", "시점·시제 확정"],
  },
  {
    name: "초고",
    note: "끝까지 쓰는 것이 유일한 목표",
    tasks: ["도입부 감 잡기", "중반 밀고 나가기", "결말까지 도달"],
  },
  {
    name: "퇴고",
    note: "구조부터, 문장은 나중에",
    tasks: ["구조 수정", "인물 일관성", "문장 다듬기"],
  },
  {
    name: "탈고",
    note: "손을 떼는 것도 기술이다",
    tasks: ["맞춤법·교정", "제목 확정", "투고본 정리"],
  },
];

const uid = (p) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const makeDefaultTemplate = () => ({
  id: uid("tpl"),
  name: "기본 서식",
  stages: BASE_STAGES.map((s) => ({
    id: uid("ts"),
    name: s.name,
    note: s.note,
    tasks: s.tasks.map((t) => ({ id: uid("tt"), text: t })),
  })),
});

function makeProject(title, logline, template) {
  const stages = (template?.stages || []).map((s) => ({
    id: uid("s"),
    name: s.name,
    note: s.note,
    tasks: s.tasks.map((t) => ({ id: uid("t"), text: t.text, done: false })),
  }));
  return {
    id: uid("p"),
    title: title.trim() || "무제",
    logline: logline.trim(),
    createdAt: Date.now(),
    completedAt: null,
    templateName: template?.name || "",
    chapters: [],
    stages,
  };
}

/* 서식을 다시 씌울 때 이미 체크한 항목은 이름으로 알아보고 살린다 */
function applyTemplate(project, template) {
  const seen = new Map();
  project.stages.forEach((s) =>
    s.tasks.forEach((t) => seen.set(`${s.name}\u0000${t.text}`, t.done))
  );
  return {
    ...project,
    templateName: template.name,
    stages: template.stages.map((s) => ({
      id: uid("s"),
      name: s.name,
      note: s.note,
      tasks: s.tasks.map((t) => ({
        id: uid("t"),
        text: t.text,
        done: seen.get(`${s.name}\u0000${t.text}`) || false,
      })),
    })),
  };
}

const normalize = (p) => (p ? { ...p, chapters: p.chapters || [] } : p);

function countTasks(p) {
  if (!p) return { done: 0, total: 0 };
  let done = 0;
  let total = 0;
  p.stages.forEach((s) =>
    s.tasks.forEach((t) => {
      total += 1;
      if (t.done) done += 1;
    })
  );
  return { done, total };
}

function countChapters(p) {
  const ch = p?.chapters || [];
  return { done: ch.filter((c) => c.done).length, total: ch.length };
}

const stageDone = (s) => s.tasks.length > 0 && s.tasks.every((t) => t.done);
const pct = ({ done, total }) => (total === 0 ? 0 : Math.round((done / total) * 100));

/* 집필대 카드는 단계와 회차를 따로 센다 — 섞지 않는다 */
function overallPct(p) {
  return pct(countTasks(p));
}

function isComplete(p) {
  const t = countTasks(p);
  const c = countChapters(p);
  if (t.total === 0 || t.done < t.total) return false;
  return c.total === 0 || c.done === c.total;
}

/* 프롤로그·에필로그를 뺀 본편에만 번호를 다시 매긴다 */
function renumber(chapters) {
  let k = 0;
  return chapters.map((c) => (c.kind && c.kind !== "normal" ? { ...c, n: null } : { ...c, n: ++k }));
}

const chapterLabel = (c) =>
  c.kind === "prologue" ? "프롤로그" : c.kind === "epilogue" ? "에필로그" : `${c.n}화`;

/* 회차 n이 속한 묶음 — 시작 화가 n 이하인 묶음 중 가장 뒤에 시작한 것 */
function arcOf(sortedArcs, n) {
  let found = null;
  for (const a of sortedArcs) {
    if (a.start <= n) found = a;
    else break;
  }
  return found;
}

function move(arr, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = [...arr];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

function mixStops(stops, t) {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const [a, b] = [stops[i], stops[i + 1]];
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

function ManuscriptGrid({ done, total, cols = 20, theme }) {
  const { GRID, CARD, STOPS } = theme;
  const cells = Math.min(total, MAX_CHAPTERS);
  const filled = total === 0 ? 0 : Math.round((done / total) * cells);
  if (cells === 0) return null;
  return (
    <div
      className="grid gap-px p-px"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        backgroundColor: GRID,
        border: `1px solid ${GRID}`,
      }}
      aria-hidden="true"
    >
      {Array.from({ length: cells }).map((_, i) => (
        <div
          key={i}
          className="transition-colors duration-300"
          style={{
            aspectRatio: "1 / 1",
            backgroundColor:
              i < filled ? mixStops(STOPS, cells > 1 ? i / (cells - 1) : 0) : CARD,
          }}
        />
      ))}
    </div>
  );
}

export default function NovelWorkshop() {
  const [state, setState] = useState({
    active: [],
    queue: [],
    archive: [],
    templates: [],
    defaultTemplateId: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentId, setCurrentId] = useState(null);
  const [open, setOpen] = useState({});
  const [celebrate, setCelebrate] = useState(null);
  const [tab, setTab] = useState("work");
  const [form, setForm] = useState({ title: "", logline: "", templateId: null });
  const [draft, setDraft] = useState({});
  const [countInput, setCountInput] = useState("100");
  const [addInput, setAddInput] = useState("10");
  const [onlyUnwritten, setOnlyUnwritten] = useState(false);
  const [arcForm, setArcForm] = useState({ start: "", name: "" });
  const [collapsedArcs, setCollapsedArcs] = useState({});
  const [editingTplId, setEditingTplId] = useState(null);
  const [applyAsk, setApplyAsk] = useState(false);
  const [edit, setEdit] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [savedTplName, setSavedTplName] = useState(null);
  const [mode, setMode] = useState("light");
  const loaded = useRef(false);

  const T = THEMES[mode] || THEMES.light;
  const { INK, INK_SOFT, PAPER, CARD, GRID, SEAL, NIB, FILL, SCRIM, GRAD, WASH } = T;

  useEffect(() => {
    (async () => {
      let data = null;
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res && res.value) data = JSON.parse(res.value);
      } catch {
        /* 최신 기록 없음 */
      }
      for (const key of LEGACY_KEYS) {
        if (data) break;
        try {
          const old = await window.storage.get(key);
          if (old && old.value) {
            const p = JSON.parse(old.value);
            data = {
              active: Array.isArray(p.active) ? p.active : p.active ? [p.active] : [],
              queue: p.queue,
              archive: p.archive,
            };
          }
        } catch {
          /* 이 형식도 없음 */
        }
      }
      const templates = data?.templates?.length ? data.templates : [makeDefaultTemplate()];
      const next = {
        active: (data?.active || []).map(normalize).slice(0, MAX_ACTIVE),
        queue: (data?.queue || []).map(normalize),
        archive: (data?.archive || []).map(normalize),
        templates,
        defaultTemplateId: data?.defaultTemplateId || templates[0].id,
      };
      setState(next);
      setCurrentId(next.active[0]?.id || null);
      setEditingTplId(next.defaultTemplateId);
      setForm((f) => ({ ...f, templateId: next.defaultTemplateId }));
      if (data?.mode === "dark" || data?.mode === "light") setMode(data.mode);
      loaded.current = true;
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    const timer = setTimeout(async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify({ ...state, mode }));
        setError(null);
      } catch {
        setError("저장에 실패했습니다. 잠시 뒤 다시 시도하세요.");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [state, mode]);

  /* 집필대에 자리가 나면 대기열 맨 위 작품이 올라온다 */
  useEffect(() => {
    if (!loaded.current) return;
    if (state.active.length >= MAX_ACTIVE || state.queue.length === 0) return;
    setState((prev) => {
      if (prev.active.length >= MAX_ACTIVE || prev.queue.length === 0) return prev;
      const [next, ...rest] = prev.queue;
      return { ...prev, active: [...prev.active, next], queue: rest };
    });
  }, [state.active.length, state.queue.length]);

  const active = state.active;
  const current = useMemo(
    () => active.find((p) => p.id === currentId) || active[0] || null,
    [active, currentId]
  );

  useEffect(() => {
    if (current && current.id !== currentId) setCurrentId(current.id);
  }, [current, currentId]);

  useEffect(() => {
    if (!current) return;
    setOpen((o) => {
      if (Object.keys(o).some((k) => current.stages.some((s) => s.id === k))) return o;
      const first = current.stages.find((s) => !stageDone(s));
      return first ? { ...o, [first.id]: true } : o;
    });
  }, [current]);

  const progress = useMemo(() => countTasks(current), [current]);
  const chapterProgress = useMemo(() => countChapters(current), [current]);
  const editingTpl = state.templates.find((t) => t.id === editingTplId) || state.templates[0];

  function finish(project) {
    const completed = { ...project, completedAt: Date.now() };
    const nx = state.queue[0];
    setState((prev) => {
      const remaining = prev.active.filter((p) => p.id !== project.id);
      const [next, ...rest] = prev.queue;
      return {
        ...prev,
        active: next ? [...remaining, next] : remaining,
        queue: next ? rest : prev.queue,
        archive: [completed, ...prev.archive],
      };
    });
    setCurrentId((prevId) => {
      if (prevId !== project.id) return prevId;
      const remaining = state.active.filter((p) => p.id !== project.id);
      return nx?.id || remaining[0]?.id || null;
    });
    setCelebrate({ done: completed.title, next: nx?.title || null });
  }

  function commit(updated) {
    if (isComplete(updated)) finish(updated);
    else
      setState((prev) => ({
        ...prev,
        active: prev.active.map((p) => (p.id === updated.id ? updated : p)),
      }));
  }

  function updateCurrent(fn) {
    if (!current) return;
    setState((prev) => ({
      ...prev,
      active: prev.active.map((p) => (p.id === current.id ? fn(p) : p)),
    }));
  }

  function toggleTask(stageId, taskId) {
    if (!current) return;
    commit({
      ...current,
      stages: current.stages.map((s) =>
        s.id !== stageId
          ? s
          : { ...s, tasks: s.tasks.map((t) => (t.id !== taskId ? t : { ...t, done: !t.done })) }
      ),
    });
  }

  function addTask(stageId) {
    const text = (draft[stageId] || "").trim();
    if (!text) return;
    updateCurrent((p) => ({
      ...p,
      stages: p.stages.map((s) =>
        s.id !== stageId ? s : { ...s, tasks: [...s.tasks, { id: uid("t"), text, done: false }] }
      ),
    }));
    setDraft((d) => ({ ...d, [stageId]: "" }));
  }

  function removeTask(stageId, taskId) {
    if (!current) return;
    commit({
      ...current,
      stages: current.stages.map((s) =>
        s.id !== stageId ? s : { ...s, tasks: s.tasks.filter((t) => t.id !== taskId) }
      ),
    });
  }

  /* 서식 */
  function updateTpl(id, fn) {
    setState((prev) => ({
      ...prev,
      templates: prev.templates.map((t) => (t.id === id ? fn(t) : t)),
    }));
  }

  /* 작품에서 손본 단계 구성을 그대로 서식으로 떠낸다 */
  function saveCurrentAsTemplate() {
    if (!current) return;
    const t = {
      id: uid("tpl"),
      name: `${current.title} 서식`,
      stages: current.stages.map((s) => ({
        id: uid("ts"),
        name: s.name,
        note: s.note || "",
        tasks: s.tasks.map((x) => ({ id: uid("tt"), text: x.text })),
      })),
    };
    setState((prev) => ({ ...prev, templates: [...prev.templates, t] }));
    setEditingTplId(t.id);
    setSavedTplName(t.name);
    setTab("templates");
  }

  function newTemplate() {
    const t = { ...makeDefaultTemplate(), name: "새 서식" };
    setState((prev) => ({ ...prev, templates: [...prev.templates, t] }));
    setEditingTplId(t.id);
  }

  function duplicateTemplate(id) {
    const src = state.templates.find((t) => t.id === id);
    if (!src) return;
    const copy = {
      id: uid("tpl"),
      name: `${src.name} 사본`,
      stages: src.stages.map((s) => ({
        ...s,
        id: uid("ts"),
        tasks: s.tasks.map((t) => ({ ...t, id: uid("tt") })),
      })),
    };
    setState((prev) => ({ ...prev, templates: [...prev.templates, copy] }));
    setEditingTplId(copy.id);
  }

  function deleteTemplate(id) {
    if (state.templates.length <= 1) return;
    setState((prev) => {
      const templates = prev.templates.filter((t) => t.id !== id);
      return {
        ...prev,
        templates,
        defaultTemplateId:
          prev.defaultTemplateId === id ? templates[0].id : prev.defaultTemplateId,
      };
    });
    setEditingTplId(state.templates.find((t) => t.id !== id)?.id || null);
  }

  const addTplStage = (id) =>
    updateTpl(id, (t) => ({
      ...t,
      stages: [...t.stages, { id: uid("ts"), name: "새 단계", note: "", tasks: [] }],
    }));

  const addTplTask = (id, stageId) =>
    updateTpl(id, (t) => ({
      ...t,
      stages: t.stages.map((s) =>
        s.id !== stageId ? s : { ...s, tasks: [...s.tasks, { id: uid("tt"), text: "" }] }
      ),
    }));

  function applyToCurrent() {
    if (!current || !editingTpl) return;
    commit(applyTemplate(current, editingTpl));
    setApplyAsk(false);
    setTab("work");
  }

  function startProject(e) {
    e?.preventDefault?.();
    if (!form.title.trim()) return;
    const tpl =
      state.templates.find((t) => t.id === form.templateId) ||
      state.templates.find((t) => t.id === state.defaultTemplateId) ||
      state.templates[0];
    const p = makeProject(form.title, form.logline, tpl);
    const goesToDesk = active.length < MAX_ACTIVE;
    setState((prev) =>
      prev.active.length < MAX_ACTIVE
        ? { ...prev, active: [...prev.active, p] }
        : { ...prev, queue: [...prev.queue, p] }
    );
    if (goesToDesk) {
      setCurrentId(p.id);
      setOpen(p.stages[0] ? { [p.stages[0].id]: true } : {});
      setTab("work");
    } else {
      setTab("queue");
    }
    setForm({ title: "", logline: "", templateId: tpl.id });
  }

  /* 제목과 로그라인 고치기 */
  function openEdit(p) {
    setConfirmDel(null);
    setEdit({ id: p.id, title: p.title, logline: p.logline || "" });
  }

  function saveEdit() {
    if (!edit) return;
    const title = edit.title.trim();
    if (!title) return;
    const patch = (p) => (p.id === edit.id ? { ...p, title, logline: edit.logline.trim() } : p);
    setState((prev) => ({
      ...prev,
      active: prev.active.map(patch),
      queue: prev.queue.map(patch),
    }));
    setEdit(null);
  }

  /* 집필대·대기열·서고 어디에 있든 지운다 */
  function deleteProject(id) {
    setState((prev) => ({
      ...prev,
      active: prev.active.filter((p) => p.id !== id),
      queue: prev.queue.filter((p) => p.id !== id),
      archive: prev.archive.filter((p) => p.id !== id),
    }));
    setConfirmDel(null);
    setEdit(null);
  }

  const moveToTop = (id) =>
    setState((prev) => {
      const target = prev.queue.find((p) => p.id === id);
      if (!target) return prev;
      return { ...prev, queue: [target, ...prev.queue.filter((p) => p.id !== id)] };
    });

  const shelve = (id) =>
    setState((prev) => {
      const target = prev.active.find((p) => p.id === id);
      if (!target) return prev;
      return {
        ...prev,
        active: prev.active.filter((p) => p.id !== id),
        queue: [...prev.queue, target],
      };
    });

  /* 회차 */
  function buildChapters(n) {
    const count = Math.max(1, Math.min(MAX_CHAPTERS, parseInt(n, 10) || 0));
    updateCurrent((p) => {
      const kept = p.chapters.slice(0, count);
      const added = Array.from({ length: Math.max(0, count - kept.length) }, (_, i) => ({
        id: uid("c"),
        n: 0,
        title: "",
        summary: "",
        done: false,
        kind: "normal",
      }));
      return { ...p, chapters: renumber([...kept, ...added]) };
    });
  }

  function appendChapters(n) {
    const add = Math.max(1, Math.min(MAX_CHAPTERS, parseInt(n, 10) || 0));
    updateCurrent((p) => {
      const room = MAX_CHAPTERS - p.chapters.length;
      const extra = Array.from({ length: Math.min(add, room) }, () => ({
        id: uid("c"),
        n: 0,
        title: "",
        summary: "",
        done: false,
        kind: "normal",
      }));
      const tail = p.chapters.filter((c) => c.kind === "epilogue");
      const head = p.chapters.filter((c) => c.kind !== "epilogue");
      return { ...p, chapters: renumber([...head, ...extra, ...tail]) };
    });
  }

  const setChapterTitle = (id, title) =>
    updateCurrent((p) => ({
      ...p,
      chapters: p.chapters.map((c) => (c.id === id ? { ...c, title } : c)),
    }));

  function toggleChapter(id) {
    if (!current) return;
    commit({
      ...current,
      chapters: current.chapters.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
    });
  }

  /* 특정 회차 바로 뒤에 한 화 끼워 넣기 */
  function insertChapterAfter(id) {
    updateCurrent((p) => {
      const i = p.chapters.findIndex((c) => c.id === id);
      if (i < 0 || p.chapters.length >= MAX_CHAPTERS) return p;
      const next = [...p.chapters];
      next.splice(i + 1, 0, { id: uid("c"), n: 0, title: "", summary: "", done: false, kind: "normal" });
      return { ...p, chapters: renumber(next) };
    });
  }

  function deleteChapter(id) {
    if (!current) return;
    commit({ ...current, chapters: renumber(current.chapters.filter((c) => c.id !== id)) });
  }

  function addBookend(kind) {
    updateCurrent((p) => {
      if (p.chapters.some((c) => c.kind === kind)) return p;
      const item = { id: uid("c"), n: null, title: "", summary: "", done: false, kind };
      const next = kind === "prologue" ? [item, ...p.chapters] : [...p.chapters, item];
      return { ...p, chapters: renumber(next) };
    });
  }

  const setChapterSummary = (id, summary) =>
    updateCurrent((p) => ({
      ...p,
      chapters: p.chapters.map((c) => (c.id === id ? { ...c, summary } : c)),
    }));

  const clearChapters = () => updateCurrent((p) => ({ ...p, chapters: [], arcs: [] }));

  /* 묶음 — 시작 화를 정하면 그 화부터 다음 묶음 전까지가 한 덩어리가 된다 */
  function addArc() {
    const start = Math.max(1, Math.min(MAX_CHAPTERS, parseInt(arcForm.start, 10) || 0));
    if (!start) return;
    updateCurrent((p) => {
      const arcs = (p.arcs || []).filter((a) => a.start !== start);
      return {
        ...p,
        arcs: [...arcs, { id: uid("a"), start, name: arcForm.name.trim() || `${start}화부터`, note: "" }],
      };
    });
    setArcForm({ start: "", name: "" });
  }

  const updateArc = (id, patch) =>
    updateCurrent((p) => ({
      ...p,
      arcs: (p.arcs || []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));

  const removeArc = (id) =>
    updateCurrent((p) => ({ ...p, arcs: (p.arcs || []).filter((a) => a.id !== id) }));

  function resetAll() {
    const tpl = makeDefaultTemplate();
    setState({ active: [], queue: [], archive: [], templates: [tpl], defaultTemplateId: tpl.id });
    setCurrentId(null);
    setEditingTplId(tpl.id);
    setOpen({});
    setCelebrate(null);
  }

  if (loading) {
    return (
      <div
        className="flex min-h-screen items-center justify-center font-sans"
        style={{ backgroundColor: PAPER, color: INK_SOFT }}
      >
        원고를 펼치는 중
      </div>
    );
  }

  const chapters = current?.chapters || [];
  const visibleChapters = onlyUnwritten ? chapters.filter((c) => !c.done) : chapters;
  const sortedArcs = [...(current?.arcs || [])].sort((a, b) => a.start - b.start);
  const arcStat = (arc) => {
    const list = chapters.filter((c) => (arcOf(sortedArcs, c.n)?.id || null) === (arc?.id || null));
    return { done: list.filter((c) => c.done).length, total: list.length };
  };
  const arcFor = (c, i, list) => {
    if (c.n) return arcOf(sortedArcs, c.n);
    for (let j = i - 1; j >= 0; j -= 1) if (list[j].n) return arcOf(sortedArcs, list[j].n);
    for (let j = i + 1; j < list.length; j += 1) if (list[j].n) return arcOf(sortedArcs, list[j].n);
    return null;
  };
  const chapterGroups = [];
  visibleChapters.forEach((c, i) => {
    const arc = arcFor(c, i, visibleChapters);
    const last = chapterGroups[chapterGroups.length - 1];
    if (last && (last.arc?.id || null) === (arc?.id || null)) last.chapters.push(c);
    else chapterGroups.push({ arc, chapters: [c] });
  });

  return (
    <div
      className="min-h-screen font-sans"
      style={{ backgroundColor: PAPER, backgroundImage: WASH, color: INK }}
    >
      <div className="mx-auto max-w-4xl px-5 py-10">
        <header
          className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-4"
          style={{ borderColor: GRID }}
        >
          <div>
            <p className="text-base tracking-widest" style={{ color: INK_SOFT }}>
              집필 공정 관리
            </p>
            <h1
              className="font-serif text-2xl font-bold tracking-tight sm:text-3xl"
              style={{
                backgroundImage: GRAD,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              체크리스트
            </h1>
          </div>
          <nav className="flex flex-wrap items-center gap-1 text-base">
            {[
              ["work", "단계", Pen],
              [
                "chapters",
                chapters.length ? `회차 ${chapterProgress.done}/${chapterProgress.total}` : "회차",
                Hash,
              ],
              ["templates", "서식", ClipboardList],
              ["queue", `대기 ${state.queue.length}`, Layers],
              ["archive", `서고 ${state.archive.length}`, Archive],
            ].map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className="flex items-center gap-1 px-3 py-1.5 transition-colors"
                style={{
                  color: tab === key ? "#FFFFFF" : INK_SOFT,
                  backgroundImage: tab === key ? GRAD : "none",
                }}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
            <button
              onClick={() => setMode(mode === "dark" ? "light" : "dark")}
              className="ml-1 flex items-center gap-1 border px-2 py-1.5"
              style={{ borderColor: GRID, color: INK_SOFT }}
              aria-label={mode === "dark" ? "밝은 화면으로" : "어두운 화면으로"}
              title={mode === "dark" ? "밝은 화면으로" : "어두운 화면으로"}
            >
              {mode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </nav>
        </header>

        {/* 집필대 */}
        {active.length > 0 && (tab === "work" || tab === "chapters") && (
          <div className="mb-6">
            <p className="mb-2 text-base tracking-widest" style={{ color: INK_SOFT }}>
              집필대 {active.length} / {MAX_ACTIVE}
            </p>
            <div className="grid gap-px sm:grid-cols-3" style={{ backgroundColor: GRID }}>
              {Array.from({ length: MAX_ACTIVE }).map((_, i) => {
                const p = active[i];
                if (!p)
                  return (
                    <div
                      key={`empty-${i}`}
                      className="px-3 py-3 text-base"
                      style={{ backgroundColor: CARD, color: INK_SOFT }}
                    >
                      빈 자리
                      <br />
                      <span className="text-base">대기열의 작품이 자동으로 올라옵니다</span>
                    </div>
                  );
                const selected = current?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setCurrentId(p.id)}
                    className="px-3 py-3 text-left"
                    style={{
                      backgroundColor: CARD,
                      backgroundImage: selected ? GRAD : "none",
                      color: selected ? "#FFFFFF" : INK,
                    }}
                  >
                    <p className="truncate font-serif">{p.title}</p>
                    <p
                      className="mt-1 text-base tabular-nums"
                      style={{ color: selected ? "rgba(255,255,255,0.85)" : INK_SOFT }}
                    >
                      단계 {overallPct(p)}%
                      {countChapters(p).total > 0 && ` · 회차 ${pct(countChapters(p))}%`}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <p className="mb-4 border px-3 py-2 text-base" style={{ borderColor: SEAL, color: SEAL }}>
            {error}
          </p>
        )}

        {/* 단계 */}
        {tab === "work" && !current && (
          <section className="border border-dashed p-8 text-center" style={{ borderColor: GRID }}>
            <BookOpen size={34} className="mx-auto mb-3" style={{ color: INK_SOFT }} />
            <h2 className="font-serif text-xl">첫 칸이 비어 있습니다</h2>
            <p className="mt-1 mb-6 text-base" style={{ color: INK_SOFT }}>
              작품을 올리면 서식에 적어둔 단계가 그대로 펼쳐집니다. 최대 세 편까지 나란히 쓸 수 있습니다.
            </p>
            <NewProjectForm
              form={form}
              setForm={setForm}
              onSubmit={startProject}
              templates={state.templates}
              theme={T}
              label="집필 시작"
            />
          </section>
        )}

        {tab === "work" && current && (
          <>
            <section className="mb-8">
              {edit?.id === current.id ? (
                <div className="mb-4 border p-4" style={{ borderColor: INK }}>
                  <input
                    value={edit.title}
                    onChange={(e) => setEdit((v) => ({ ...v, title: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    placeholder="작품 제목"
                    className="w-full border-b bg-transparent px-1 py-2 font-serif text-2xl font-bold outline-none"
                    style={{ borderColor: GRID }}
                  />
                  <input
                    value={edit.logline}
                    onChange={(e) => setEdit((v) => ({ ...v, logline: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    placeholder="로그라인 한 문장 (선택)"
                    className="mt-2 w-full border-b bg-transparent px-1 py-2 text-base italic outline-none"
                    style={{ borderColor: GRID }}
                  />
                  <div className="mt-4 flex flex-wrap items-center gap-3 text-base">
                    <button onClick={saveEdit} className="px-4 py-2" style={{ backgroundImage: GRAD, color: "#FFFFFF" }}>
                      저장
                    </button>
                    <button onClick={() => setEdit(null)} style={{ color: INK_SOFT }}>
                      취소
                    </button>
                    <button
                      onClick={() => setConfirmDel(current.id)}
                      className="ml-auto flex items-center gap-1"
                      style={{ color: SEAL }}
                    >
                      <Trash2 size={18} /> 작품 삭제
                    </button>
                  </div>
                  {confirmDel === current.id && (
                    <div className="mt-3 border p-3 text-base" style={{ borderColor: SEAL }}>
                      <p>
                        『{current.title}』을(를) 단계·회차 기록까지 모두 지웁니다. 되돌릴 수 없습니다.
                      </p>
                      <div className="mt-3 flex gap-3">
                        <button
                          onClick={() => deleteProject(current.id)}
                          className="px-4 py-2"
                          style={{ backgroundColor: SEAL, color: PAPER }}
                        >
                          지웁니다
                        </button>
                        <button onClick={() => setConfirmDel(null)} style={{ color: INK_SOFT }}>
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mb-3 flex items-baseline justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-serif text-2xl font-bold">{current.title}</h2>
                      <button onClick={() => openEdit(current)} style={{ color: INK_SOFT }} aria-label="작품 정보 수정">
                        <Pencil size={18} />
                      </button>
                    </div>
                    {current.logline && (
                      <p className="mt-1 text-base italic" style={{ color: INK_SOFT }}>
                        {current.logline}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-serif text-3xl font-bold" style={{ color: NIB }}>
                      {pct(progress)}%
                    </div>
                    <div className="text-base" style={{ color: INK_SOFT }}>
                      단계 {progress.done} / {progress.total}
                    </div>
                  </div>
                </div>
              )}
              <ManuscriptGrid done={progress.done} total={progress.total} theme={T} />
              <div className="mt-2 flex items-center justify-between text-base" style={{ color: INK_SOFT }}>
                {chapters.length > 0 ? (
                  <button onClick={() => setTab("chapters")} className="underline">
                    회차 {chapterProgress.done} / {chapterProgress.total} 집필 완료
                  </button>
                ) : (
                  <span>{current.templateName ? `${current.templateName} 적용 중` : ""}</span>
                )}
                <button onClick={() => shelve(current.id)} className="underline">
                  잠시 내려두기
                </button>
              </div>
            </section>

            <section className="space-y-px">
              {current.stages.map((stage, i) => {
                const complete = stageDone(stage);
                const c = {
                  done: stage.tasks.filter((t) => t.done).length,
                  total: stage.tasks.length,
                };
                const isOpen = !!open[stage.id];
                return (
                  <div key={stage.id} className="border" style={{ borderColor: GRID, backgroundColor: CARD }}>
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [stage.id]: !o[stage.id] }))}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                      style={{ backgroundColor: complete ? FILL : CARD }}
                    >
                      {isOpen ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                      <span className="w-6 font-serif text-base" style={{ color: INK_SOFT }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="flex-1 font-serif text-lg">{stage.name}</span>
                      <span className="text-base tabular-nums" style={{ color: INK_SOFT }}>
                        {c.done}/{c.total}
                      </span>
                      {complete && <Check size={20} style={{ color: NIB }} />}
                    </button>

                    {isOpen && (
                      <div className="border-t px-4 py-3" style={{ borderColor: GRID }}>
                        {stage.note && (
                          <p className="mb-3 text-base italic" style={{ color: INK_SOFT }}>
                            {stage.note}
                          </p>
                        )}
                        <ul className="space-y-1">
                          {stage.tasks.map((t) => (
                            <li key={t.id} className="group flex items-center gap-3">
                              <button
                                onClick={() => toggleTask(stage.id, t.id)}
                                className="flex h-7 w-7 shrink-0 items-center justify-center border"
                                style={{
                                  borderColor: t.done ? NIB : GRID,
                                  backgroundColor: t.done ? NIB : "transparent",
                                }}
                                aria-label={t.done ? "완료 취소" : "완료 표시"}
                              >
                                {t.done && <Check size={14} color={PAPER} />}
                              </button>
                              <span
                                className="flex-1 py-1 text-base"
                                style={{
                                  color: t.done ? INK_SOFT : INK,
                                  textDecoration: t.done ? "line-through" : "none",
                                }}
                              >
                                {t.text}
                              </span>
                              <button
                                onClick={() => removeTask(stage.id, t.id)}
                                className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                                style={{ color: INK_SOFT }}
                                aria-label="항목 삭제"
                              >
                                <Trash2 size={18} />
                              </button>
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3 flex gap-2">
                          <input
                            value={draft[stage.id] || ""}
                            onChange={(e) => setDraft((d) => ({ ...d, [stage.id]: e.target.value }))}
                            onKeyDown={(e) => e.key === "Enter" && addTask(stage.id)}
                            placeholder="이 작품에만 항목 추가"
                            className="flex-1 border-b bg-transparent px-1 py-1 text-base outline-none"
                            style={{ borderColor: GRID }}
                          />
                          <button
                            onClick={() => addTask(stage.id)}
                            className="flex items-center gap-1 px-2 text-base"
                            style={{ color: NIB }}
                          >
                            <ListPlus size={18} /> 추가
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>

            <button
              onClick={saveCurrentAsTemplate}
              className="mt-4 flex w-full items-center justify-center gap-2 border border-dashed py-3 text-base"
              style={{ borderColor: GRID, color: NIB }}
            >
              <ClipboardList size={18} /> 지금 이 단계 구성을 새 서식으로 저장
            </button>
          </>
        )}

        {/* 서식 */}
        {tab === "templates" && editingTpl && (
          <section>
            <h2 className="mb-1 font-serif text-xl">서식</h2>
            <p className="mb-4 text-base" style={{ color: INK_SOFT }}>
              단계와 체크리스트를 여기서 한 번에 짜두면, 새 작품은 이 구성으로 시작합니다.
            </p>
            {savedTplName && (
              <p className="mb-4 border px-3 py-2 text-base" style={{ borderColor: NIB, color: NIB }}>
                작업 중인 구성을 『{savedTplName}』으로 떠왔습니다. 이름을 고치고 기본으로 지정할 수 있습니다.
                <button onClick={() => setSavedTplName(null)} className="ml-2 underline">
                  닫기
                </button>
              </p>
            )}

            <div className="mb-5 flex flex-wrap gap-1">
              {state.templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setEditingTplId(t.id);
                    setApplyAsk(false);
                  }}
                  className="px-3 py-1.5 text-base"
                  style={{
                    backgroundImage: t.id === editingTpl.id ? GRAD : "none",
                    color: t.id === editingTpl.id ? "#FFFFFF" : INK_SOFT,
                    border: `1px solid ${t.id === editingTpl.id ? "transparent" : GRID}`,
                  }}
                >
                  {t.name}
                  {t.id === state.defaultTemplateId && " ·기본"}
                </button>
              ))}
              <button
                onClick={newTemplate}
                className="flex items-center gap-1 px-3 py-1.5 text-base"
                style={{ border: `1px dashed ${GRID}`, color: NIB }}
              >
                <Plus size={18} /> 새 서식
              </button>
            </div>

            <input
              value={editingTpl.name}
              onChange={(e) => updateTpl(editingTpl.id, (t) => ({ ...t, name: e.target.value }))}
              placeholder="서식 이름"
              className="mb-4 w-full border-b bg-transparent px-1 py-2 font-serif text-lg outline-none"
              style={{ borderColor: GRID }}
            />

            <div className="space-y-px">
              {editingTpl.stages.map((s, i) => (
                <div key={s.id} className="border p-4" style={{ borderColor: GRID, backgroundColor: CARD }}>
                  <div className="flex items-center gap-2">
                    <span className="w-6 font-serif text-base" style={{ color: INK_SOFT }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <input
                      value={s.name}
                      onChange={(e) =>
                        updateTpl(editingTpl.id, (t) => ({
                          ...t,
                          stages: t.stages.map((x) =>
                            x.id === s.id ? { ...x, name: e.target.value } : x
                          ),
                        }))
                      }
                      placeholder="단계 이름"
                      className="flex-1 border-b bg-transparent px-1 py-1 font-serif text-lg outline-none"
                      style={{ borderColor: GRID }}
                    />
                    <button
                      onClick={() =>
                        updateTpl(editingTpl.id, (t) => ({ ...t, stages: move(t.stages, i, -1) }))
                      }
                      style={{ color: INK_SOFT }}
                      aria-label="위로"
                    >
                      <ArrowUp size={18} />
                    </button>
                    <button
                      onClick={() =>
                        updateTpl(editingTpl.id, (t) => ({ ...t, stages: move(t.stages, i, 1) }))
                      }
                      style={{ color: INK_SOFT }}
                      aria-label="아래로"
                    >
                      <ArrowDown size={18} />
                    </button>
                    <button
                      onClick={() =>
                        updateTpl(editingTpl.id, (t) => ({
                          ...t,
                          stages: t.stages.filter((x) => x.id !== s.id),
                        }))
                      }
                      style={{ color: SEAL }}
                      aria-label="단계 삭제"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <input
                    value={s.note}
                    onChange={(e) =>
                      updateTpl(editingTpl.id, (t) => ({
                        ...t,
                        stages: t.stages.map((x) => (x.id === s.id ? { ...x, note: e.target.value } : x)),
                      }))
                    }
                    placeholder="이 단계에 붙일 한 줄 (선택)"
                    className="mt-2 mb-3 w-full bg-transparent px-1 text-base italic outline-none"
                    style={{ color: INK_SOFT }}
                  />

                  <ul className="space-y-1">
                    {s.tasks.map((t) => (
                      <li key={t.id} className="flex items-center gap-2">
                        <span
                          className="h-6 w-6 shrink-0 border"
                          style={{ borderColor: GRID }}
                          aria-hidden="true"
                        />
                        <input
                          value={t.text}
                          onChange={(e) =>
                            updateTpl(editingTpl.id, (tp) => ({
                              ...tp,
                              stages: tp.stages.map((x) =>
                                x.id !== s.id
                                  ? x
                                  : {
                                      ...x,
                                      tasks: x.tasks.map((y) =>
                                        y.id === t.id ? { ...y, text: e.target.value } : y
                                      ),
                                    }
                              ),
                            }))
                          }
                          placeholder="체크리스트 항목"
                          className="flex-1 bg-transparent py-1 text-base outline-none"
                        />
                        <button
                          onClick={() =>
                            updateTpl(editingTpl.id, (tp) => ({
                              ...tp,
                              stages: tp.stages.map((x) =>
                                x.id !== s.id ? x : { ...x, tasks: x.tasks.filter((y) => y.id !== t.id) }
                              ),
                            }))
                          }
                          style={{ color: INK_SOFT }}
                          aria-label="항목 삭제"
                        >
                          <X size={18} />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => addTplTask(editingTpl.id, s.id)}
                    className="mt-2 flex items-center gap-1 text-base"
                    style={{ color: NIB }}
                  >
                    <ListPlus size={18} /> 항목 추가
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={() => addTplStage(editingTpl.id)}
              className="mt-3 flex w-full items-center justify-center gap-1 border border-dashed py-3 text-base"
              style={{ borderColor: GRID, color: NIB }}
            >
              <Plus size={18} /> 단계 추가
            </button>

            <div
              className="mt-6 flex flex-wrap items-center gap-4 border-t pt-4 text-base"
              style={{ borderColor: GRID }}
            >
              <button
                onClick={() =>
                  setState((prev) => ({ ...prev, defaultTemplateId: editingTpl.id }))
                }
                style={{ color: state.defaultTemplateId === editingTpl.id ? INK_SOFT : NIB }}
                disabled={state.defaultTemplateId === editingTpl.id}
              >
                {state.defaultTemplateId === editingTpl.id ? "새 작품 기본 서식" : "새 작품 기본으로 지정"}
              </button>
              <button
                onClick={() => duplicateTemplate(editingTpl.id)}
                className="flex items-center gap-1"
                style={{ color: INK_SOFT }}
              >
                <Copy size={18} /> 복제
              </button>
              {state.templates.length > 1 && (
                <button onClick={() => deleteTemplate(editingTpl.id)} style={{ color: SEAL }}>
                  삭제
                </button>
              )}
              {current && (
                <button
                  onClick={() => setApplyAsk(true)}
                  className="ml-auto px-4 py-2"
                  style={{ backgroundImage: GRAD, color: "#FFFFFF" }}
                >
                  『{current.title}』에 적용
                </button>
              )}
            </div>

            {applyAsk && current && (
              <div className="mt-3 border p-4 text-base" style={{ borderColor: SEAL }}>
                <p>
                  『{current.title}』의 단계 구성을 <strong>{editingTpl.name}</strong>으로 바꿉니다. 이름이
                  같은 항목의 체크는 그대로 남고, 서식에 없는 항목은 사라집니다. 회차 목록은 그대로입니다.
                </p>
                <div className="mt-3 flex gap-3">
                  <button onClick={applyToCurrent} className="px-4 py-2" style={{ backgroundColor: SEAL, color: PAPER }}>
                    적용
                  </button>
                  <button onClick={() => setApplyAsk(false)} style={{ color: INK_SOFT }}>
                    취소
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 회차 */}
        {tab === "chapters" && !current && (
          <p className="py-10 text-center text-base" style={{ color: INK_SOFT }}>
            집필대가 비었습니다. 먼저 작품을 올려 주세요.
          </p>
        )}

        {tab === "chapters" && current && chapters.length === 0 && (
          <section className="border border-dashed p-8" style={{ borderColor: GRID }}>
            <h2 className="font-serif text-xl">
              <span style={{ color: INK_SOFT }}>{current.title}</span> · 총 몇 화로 쓸 계획인가요
            </h2>
            <p className="mt-1 mb-6 text-base" style={{ color: INK_SOFT }}>
              숫자를 정하면 1화부터 차례대로 칸이 만들어집니다. 나중에 늘릴 수 있습니다.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                max={MAX_CHAPTERS}
                value={countInput}
                onChange={(e) => setCountInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && buildChapters(countInput)}
                className="w-24 border-b bg-transparent px-1 py-2 text-right font-serif text-2xl outline-none"
                style={{ borderColor: GRID }}
              />
              <span className="font-serif text-lg">화</span>
              <button
                onClick={() => buildChapters(countInput)}
                className="ml-3 flex items-center gap-2 px-4 py-2 text-base"
                style={{ backgroundImage: GRAD, color: "#FFFFFF" }}
              >
                <Plus size={18} /> 회차 만들기
              </button>
            </div>
          </section>
        )}

        {tab === "chapters" && current && chapters.length > 0 && (
          <section>
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <div>
                <h2 className="font-serif text-2xl font-bold">{current.title}</h2>
                <p className="text-base" style={{ color: INK_SOFT }}>
                  전 {chapters.length}화 · 소제목 {chapters.filter((c) => c.title.trim()).length}개 · 줄거리{" "}
                  {chapters.filter((c) => (c.summary || "").trim()).length}개
                  {sortedArcs.length > 0 ? ` · ${sortedArcs.length}묶음` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-serif text-3xl font-bold" style={{ color: NIB }}>
                  {pct(chapterProgress)}%
                </div>
                <div className="text-base" style={{ color: INK_SOFT }}>
                  {chapterProgress.done} / {chapterProgress.total} 화
                </div>
              </div>
            </div>
            <ManuscriptGrid done={chapterProgress.done} total={chapterProgress.total} cols={25} theme={T} />

            {/* 묶음·앞뒤 회차 만들기 */}
            <div
              className="mt-4 border p-3 text-base"
              style={{ borderColor: GRID, backgroundColor: CARD }}
            >
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-base" style={{ color: INK_SOFT }}>
                    시작 화
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={chapters.length}
                    value={arcForm.start}
                    onChange={(e) => setArcForm((f) => ({ ...f, start: e.target.value }))}
                    placeholder="31"
                    className="w-20 border-b bg-transparent px-1 py-1 text-right outline-none"
                    style={{ borderColor: GRID }}
                  />
                </div>
                <div className="min-w-40 flex-1">
                  <label className="block text-base" style={{ color: INK_SOFT }}>
                    묶음 이름
                  </label>
                  <input
                    value={arcForm.name}
                    onChange={(e) => setArcForm((f) => ({ ...f, name: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && addArc()}
                    placeholder="2부 · 왕도로 가는 길"
                    className="w-full border-b bg-transparent px-1 py-1 outline-none"
                    style={{ borderColor: GRID }}
                  />
                </div>
                <button
                  onClick={addArc}
                  className="flex items-center gap-1 px-3 py-2"
                  style={{ backgroundImage: GRAD, color: "#FFFFFF" }}
                >
                  <Plus size={18} /> 묶음 만들기
                </button>
              </div>
              <div
                className="mt-3 flex flex-wrap items-center gap-4 border-t pt-3"
                style={{ borderColor: GRID }}
              >
                <button
                  onClick={() => addBookend("prologue")}
                  className="flex items-center gap-1"
                  style={{ color: chapters.some((c) => c.kind === "prologue") ? INK_SOFT : NIB }}
                  disabled={chapters.some((c) => c.kind === "prologue")}
                >
                  <Plus size={18} /> 프롤로그
                </button>
                <button
                  onClick={() => addBookend("epilogue")}
                  className="flex items-center gap-1"
                  style={{ color: chapters.some((c) => c.kind === "epilogue") ? INK_SOFT : NIB }}
                  disabled={chapters.some((c) => c.kind === "epilogue")}
                >
                  <Plus size={18} /> 에필로그
                </button>
                <span className="text-base" style={{ color: INK_SOFT }}>
                  묶음은 시작 화부터 다음 묶음 직전까지입니다
                </span>
              </div>
            </div>

            <div className="mt-5 mb-2 flex items-center justify-between">
              <button
                onClick={() => setOnlyUnwritten((v) => !v)}
                className="flex items-center gap-2 text-base"
                style={{ color: INK_SOFT }}
              >
                <span
                  className="flex h-6 w-6 items-center justify-center border"
                  style={{
                    borderColor: onlyUnwritten ? NIB : GRID,
                    backgroundColor: onlyUnwritten ? NIB : "transparent",
                  }}
                >
                  {onlyUnwritten && <Check size={12} color={PAPER} />}
                </span>
                아직 못 쓴 회차만 보기
              </button>
              {sortedArcs.length > 0 ? (
                <button
                  onClick={() =>
                    setCollapsedArcs((o) => {
                      const anyOpen = sortedArcs.some((a) => !o[a.id]);
                      const next = {};
                      sortedArcs.forEach((a) => {
                        next[a.id] = anyOpen;
                      });
                      return next;
                    })
                  }
                  className="text-base underline"
                  style={{ color: INK_SOFT }}
                >
                  {sortedArcs.some((a) => !collapsedArcs[a.id]) ? "묶음 모두 접기" : "묶음 모두 펼치기"}
                </button>
              ) : (
                <span className="text-base" style={{ color: INK_SOFT }}>
                  제목을 적고 왼쪽 칸을 눌러 집필 완료로 표시
                </span>
              )}
            </div>

            <div className="border" style={{ borderColor: GRID, backgroundColor: CARD }}>
              {chapterGroups.map((g, gi) => {
                const stat = g.arc ? arcStat(g.arc) : null;
                return (
                  <div key={g.arc?.id || `loose-${gi}`}>
                    {g.arc ? (
                      <div
                        className="border-b px-3 py-3"
                        style={{
                          borderColor: GRID,
                          backgroundColor: CARD,
                          backgroundImage: `linear-gradient(115deg, ${FILL}, transparent 70%)`,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() =>
                              setCollapsedArcs((o) => ({ ...o, [g.arc.id]: !o[g.arc.id] }))
                            }
                            className="shrink-0"
                            style={{ color: INK_SOFT }}
                            aria-label={collapsedArcs[g.arc.id] ? "묶음 펼치기" : "묶음 접기"}
                          >
                            {collapsedArcs[g.arc.id] ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                          </button>
                          <span className="shrink-0 text-base tabular-nums" style={{ color: INK_SOFT }}>
                            {g.arc.start}화~
                          </span>
                          <input
                            value={g.arc.name}
                            onChange={(e) => updateArc(g.arc.id, { name: e.target.value })}
                            placeholder="묶음 이름"
                            className="flex-1 bg-transparent font-serif text-lg outline-none"
                          />
                          <span className="shrink-0 text-base tabular-nums" style={{ color: INK_SOFT }}>
                            {stat.done}/{stat.total}화
                          </span>
                          <button onClick={() => removeArc(g.arc.id)} style={{ color: INK_SOFT }} aria-label="묶음 풀기">
                            <X size={18} />
                          </button>
                        </div>
                        <input
                          value={g.arc.note || ""}
                          onChange={(e) => updateArc(g.arc.id, { note: e.target.value })}
                          placeholder="이 묶음에서 벌어지는 일 한 줄"
                          className="mt-1 w-full bg-transparent text-base italic outline-none"
                          style={{ color: INK_SOFT }}
                        />
                      </div>
                    ) : (
                      sortedArcs.length > 0 && (
                        <div
                          className="border-b px-3 py-2 text-base"
                          style={{ borderColor: GRID, backgroundColor: PAPER, color: INK_SOFT }}
                        >
                          묶이지 않은 회차
                        </div>
                      )
                    )}

                    {g.arc && collapsedArcs[g.arc.id] && (
                      <button
                        onClick={() => setCollapsedArcs((o) => ({ ...o, [g.arc.id]: false }))}
                        className="w-full border-b px-3 py-2 text-left text-base"
                        style={{ borderColor: GRID, color: INK_SOFT, backgroundColor: CARD }}
                      >
                        {g.chapters.length}개 회차 접어둠 — 눌러서 펼치기
                      </button>
                    )}
                    {(!g.arc || !collapsedArcs[g.arc.id]) &&
                      g.chapters.map((c) => (
                        <div
                          key={c.id}
                          className="group border-b px-3 py-2"
                          style={{ borderColor: GRID, backgroundColor: c.done ? FILL : CARD }}
                        >
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => toggleChapter(c.id)}
                              className="flex h-7 w-7 shrink-0 items-center justify-center border"
                              style={{
                                borderColor: c.done ? NIB : GRID,
                                backgroundColor: c.done ? NIB : "transparent",
                              }}
                              aria-label={`${chapterLabel(c)} 집필 ${c.done ? "취소" : "완료"}`}
                            >
                              {c.done && <Check size={14} color={CARD} />}
                            </button>
                            <span
                              className="w-20 shrink-0 text-right font-serif text-base tabular-nums"
                              style={{ color: INK_SOFT }}
                            >
                              {chapterLabel(c)}
                            </span>
                            <input
                              value={c.title}
                              onChange={(e) => setChapterTitle(c.id, e.target.value)}
                              placeholder="소제목"
                              className="flex-1 bg-transparent py-1 text-base outline-none"
                              style={{ color: c.done ? INK_SOFT : INK }}
                            />
                            <button
                              onClick={() => insertChapterAfter(c.id)}
                              className="shrink-0 opacity-40 transition-opacity group-hover:opacity-100 focus:opacity-100"
                              style={{ color: NIB }}
                              aria-label={`${chapterLabel(c)} 뒤에 회차 추가`}
                              title="바로 뒤에 한 화 끼워 넣기"
                            >
                              <Plus size={18} />
                            </button>
                            <button
                              onClick={() => deleteChapter(c.id)}
                              className="shrink-0 opacity-40 transition-opacity group-hover:opacity-100 focus:opacity-100"
                              style={{ color: INK_SOFT }}
                              aria-label={`${chapterLabel(c)} 삭제`}
                              title="이 회차 지우기"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                          <input
                            value={c.summary || ""}
                            onChange={(e) => setChapterSummary(c.id, e.target.value)}
                            placeholder="한 줄 줄거리"
                            className="mt-1 w-full bg-transparent pb-1 text-base outline-none sm:pl-28"
                            style={{ color: INK_SOFT }}
                          />
                        </div>
                      ))}
                  </div>
                );
              })}
              {visibleChapters.length === 0 && (
                <p className="px-3 py-6 text-center text-base" style={{ color: INK_SOFT }}>
                  모든 회차를 다 썼습니다.
                </p>
              )}
            </div>


            <div className="mt-4 flex flex-wrap items-center gap-3 text-base">
              <input
                type="number"
                min="1"
                value={addInput}
                onChange={(e) => setAddInput(e.target.value)}
                className="w-16 border-b bg-transparent px-1 py-1 text-right outline-none"
                style={{ borderColor: GRID }}
              />
              <button onClick={() => appendChapters(addInput)} className="flex items-center gap-1" style={{ color: NIB }}>
                <Plus size={18} /> 화 더 늘리기
              </button>
              <button onClick={clearChapters} className="ml-auto text-base underline" style={{ color: INK_SOFT }}>
                회차 목록 지우기
              </button>
            </div>
          </section>
        )}

        {/* 대기열 */}
        {tab === "queue" && (
          <section>
            <h2 className="mb-1 font-serif text-xl">대기열</h2>
            <p className="mb-5 text-base" style={{ color: INK_SOFT }}>
              집필대는 세 자리입니다. 자리가 나면 맨 위 작품이 바로 올라옵니다.
            </p>
            <NewProjectForm
              form={form}
              setForm={setForm}
              onSubmit={startProject}
              templates={state.templates}
              theme={T}
              label={active.length < MAX_ACTIVE ? "집필대에 올리기" : "대기열에 넣기"}
            />
            <ul className="mt-6 space-y-px">
              {state.queue.map((p, i) => (
                <li key={p.id} className="border px-4 py-3" style={{ borderColor: GRID, backgroundColor: CARD }}>
                  {edit?.id === p.id ? (
                    <div>
                      <input
                        value={edit.title}
                        onChange={(e) => setEdit((v) => ({ ...v, title: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        placeholder="작품 제목"
                        className="w-full border-b bg-transparent px-1 py-1 font-serif outline-none"
                        style={{ borderColor: GRID }}
                      />
                      <input
                        value={edit.logline}
                        onChange={(e) => setEdit((v) => ({ ...v, logline: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                        placeholder="로그라인 한 문장 (선택)"
                        className="mt-1 w-full border-b bg-transparent px-1 py-1 text-base outline-none"
                        style={{ borderColor: GRID }}
                      />
                      <div className="mt-3 flex items-center gap-3 text-base">
                        <button onClick={saveEdit} className="px-3 py-1" style={{ backgroundImage: GRAD, color: "#FFFFFF" }}>
                          저장
                        </button>
                        <button onClick={() => setEdit(null)} style={{ color: INK_SOFT }}>
                          취소
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <span className="font-serif text-base" style={{ color: INK_SOFT }}>
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="font-serif">{p.title}</p>
                        {p.logline && (
                          <p className="text-base" style={{ color: INK_SOFT }}>
                            {p.logline}
                          </p>
                        )}
                      </div>
                      <button onClick={() => openEdit(p)} style={{ color: INK_SOFT }} aria-label="작품 정보 수정">
                        <Pencil size={18} />
                      </button>
                      {i > 0 && (
                        <button onClick={() => moveToTop(p.id)} style={{ color: INK_SOFT }} aria-label="맨 위로">
                          <ChevronsUp size={20} />
                        </button>
                      )}
                      <button onClick={() => setConfirmDel(p.id)} style={{ color: INK_SOFT }} aria-label="작품 삭제">
                        <X size={20} />
                      </button>
                    </div>
                  )}
                  {confirmDel === p.id && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-base" style={{ color: SEAL }}>
                      <span>『{p.title}』을(를) 지웁니다. 되돌릴 수 없습니다.</span>
                      <button
                        onClick={() => deleteProject(p.id)}
                        className="px-3 py-1"
                        style={{ backgroundColor: SEAL, color: PAPER }}
                      >
                        지웁니다
                      </button>
                      <button onClick={() => setConfirmDel(null)} style={{ color: INK_SOFT }}>
                        취소
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {state.queue.length === 0 && (
                <li className="py-6 text-center text-base" style={{ color: INK_SOFT }}>
                  대기 중인 작품이 없습니다.
                </li>
              )}
            </ul>
          </section>
        )}

        {/* 서고 */}
        {tab === "archive" && (
          <section>
            <h2 className="mb-5 font-serif text-xl">탈고한 작품</h2>
            <ul className="space-y-px">
              {state.archive.map((p) => (
                <li key={p.id} className="border px-4 py-3" style={{ borderColor: GRID, backgroundColor: CARD }}>
                  <div className="flex items-center gap-3">
                    <Stamp size={20} style={{ color: SEAL }} />
                    <div className="flex-1">
                      <p className="font-serif">{p.title}</p>
                      <p className="text-base" style={{ color: INK_SOFT }}>
                        {new Date(p.completedAt).toLocaleDateString("ko-KR")} 종료 · 전 {p.stages.length}단계
                        {p.chapters?.length ? ` · 전 ${p.chapters.length}화` : ""}
                      </p>
                    </div>
                    <button onClick={() => setConfirmDel(p.id)} style={{ color: INK_SOFT }} aria-label="기록 삭제">
                      <X size={20} />
                    </button>
                  </div>
                  {confirmDel === p.id && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-base" style={{ color: SEAL }}>
                      <span>서고에서 지웁니다. 되돌릴 수 없습니다.</span>
                      <button
                        onClick={() => deleteProject(p.id)}
                        className="px-3 py-1"
                        style={{ backgroundColor: SEAL, color: PAPER }}
                      >
                        지웁니다
                      </button>
                      <button onClick={() => setConfirmDel(null)} style={{ color: INK_SOFT }}>
                        취소
                      </button>
                    </div>
                  )}
                </li>
              ))}
              {state.archive.length === 0 && (
                <li className="py-6 text-center text-base" style={{ color: INK_SOFT }}>
                  아직 비어 있습니다. 한 편을 끝내면 여기 남습니다.
                </li>
              )}
            </ul>
            {(state.archive.length > 0 || state.queue.length > 0 || active.length > 0) && (
              <button onClick={resetAll} className="mt-8 text-base underline" style={{ color: INK_SOFT }}>
                모든 기록 지우기
              </button>
            )}
          </section>
        )}
      </div>

      {/* 종료 도장 */}
      {celebrate && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center p-6"
          style={{ backgroundColor: SCRIM }}
        >
          <div className="w-full max-w-sm p-8 text-center" style={{ backgroundColor: CARD }}>
            <div
              className="mx-auto mb-5 flex h-20 w-20 items-center justify-center border-4 font-serif text-xl font-bold"
              style={{ borderColor: SEAL, color: SEAL, transform: "rotate(-8deg)" }}
            >
              脫稿
            </div>
            <h3 className="font-serif text-xl font-bold">{celebrate.done}</h3>
            <p className="mt-1 text-base" style={{ color: INK_SOFT }}>
              단계와 회차를 모두 마쳤습니다. 서고로 옮겼습니다.
            </p>
            <p className="mt-4 border-t pt-4 text-base" style={{ borderColor: GRID }}>
              {celebrate.next ? (
                <>
                  빈자리에 <strong className="font-serif">{celebrate.next}</strong> 을(를) 올렸습니다.
                </>
              ) : (
                "대기열이 비었습니다. 새 작품을 올려 주세요."
              )}
            </p>
            <button
              onClick={() => {
                setCelebrate(null);
                setTab(celebrate.next || active.length > 0 ? "work" : "queue");
              }}
              className="mt-6 w-full py-2 text-base"
              style={{ backgroundImage: GRAD, color: "#FFFFFF" }}
            >
              계속 쓰기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function NewProjectForm({ form, setForm, onSubmit, label, templates, theme }) {
  const { INK, INK_SOFT, GRID, GRAD } = theme;
  return (
    <div className="space-y-3 text-left">
      <input
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder="작품 제목"
        className="w-full border-b bg-transparent px-1 py-2 font-serif text-lg outline-none"
        style={{ borderColor: GRID }}
      />
      <input
        value={form.logline}
        onChange={(e) => setForm((f) => ({ ...f, logline: e.target.value }))}
        onKeyDown={(e) => e.key === "Enter" && onSubmit()}
        placeholder="로그라인 한 문장 (선택)"
        className="w-full border-b bg-transparent px-1 py-2 text-base outline-none"
        style={{ borderColor: GRID }}
      />
      {templates.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-base" style={{ color: INK_SOFT }}>
            서식
          </span>
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setForm((f) => ({ ...f, templateId: t.id }))}
              className="px-2 py-1 text-base"
              style={{
                border: `1px solid ${form.templateId === t.id ? "transparent" : GRID}`,
                color: form.templateId === t.id ? "#FFFFFF" : INK_SOFT,
                backgroundImage: form.templateId === t.id ? GRAD : "none",
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      )}
      <button
        onClick={onSubmit}
        className="flex items-center gap-2 px-4 py-2 text-base"
        style={{ backgroundImage: GRAD, color: "#FFFFFF" }}
      >
        <Plus size={18} /> {label}
      </button>
    </div>
  );
}
