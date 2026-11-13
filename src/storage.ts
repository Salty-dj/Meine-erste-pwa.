export type Task = { id: string; title: string; notes: string; due: string; priority: 'normal' | 'high'; done: boolean };
export const STORAGE_KEY = 'klar.tasks.v1';
export function loadTasks(): Task[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || !data.every(t => t && typeof t.id === 'string' && typeof t.title === 'string' && typeof t.notes === 'string' && typeof t.due === 'string' && (t.priority === 'normal' || t.priority === 'high') && typeof t.done === 'boolean')) throw new Error('Ungültiger Speicher');
  return data;
}
export function saveTasks(tasks: Task[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
export function localDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
