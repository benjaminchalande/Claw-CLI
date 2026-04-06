import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { PlanningStore } from '../store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION = readFileSync(join(__dirname, '..', '..', '..', 'migrations', '004_epics_tasks.sql'), 'utf-8');

let db: Database.Database;
let store: PlanningStore;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec(MIGRATION);
  store = new PlanningStore(db);
});

afterEach(() => db.close());

describe('PlanningStore — Epics', () => {
  it('creates an epic with defaults', () => {
    const epic = store.createEpic('Test epic');
    expect(epic.title).toBe('Test epic');
    expect(epic.status).toBe('active');
    expect(epic.priority).toBe('P2');
    expect(epic.source).toBe('owner');
  });

  it('creates an epic with options', () => {
    const epic = store.createEpic('Important', {
      priority: 'P1',
      description: 'Urgent work',
      success_criteria: 'All tests pass',
    });
    expect(epic.priority).toBe('P1');
    expect(epic.description).toBe('Urgent work');
    expect(epic.success_criteria).toBe('All tests pass');
  });

  it('gets an epic by id', () => {
    const created = store.createEpic('Find me');
    const found = store.getEpic(created.id);
    expect(found).not.toBeNull();
    expect(found!.title).toBe('Find me');
  });

  it('returns null for missing epic', () => {
    expect(store.getEpic(999)).toBeNull();
  });

  it('lists active epics by default', () => {
    store.createEpic('Active');
    store.createEpic('Also active');
    const completed = store.createEpic('Done');
    store.updateEpic(completed.id, { status: 'completed' });

    const list = store.listEpics();
    expect(list).toHaveLength(2);
  });

  it('lists all epics when requested', () => {
    store.createEpic('Active');
    const completed = store.createEpic('Done');
    store.updateEpic(completed.id, { status: 'completed' });

    const list = store.listEpics({ all: true });
    expect(list).toHaveLength(2);
  });

  it('updates an epic', () => {
    const epic = store.createEpic('Original');
    store.updateEpic(epic.id, { title: 'Updated', status: 'completed' });
    const updated = store.getEpic(epic.id);
    expect(updated!.title).toBe('Updated');
    expect(updated!.status).toBe('completed');
  });
});

describe('PlanningStore — Tasks', () => {
  it('creates a task', () => {
    const task = store.createTask('Do something');
    expect(task.title).toBe('Do something');
    expect(task.status).toBe('pending');
    expect(task.epic_id).toBeNull();
  });

  it('creates a task linked to an epic', () => {
    const epic = store.createEpic('Parent');
    const task = store.createTask('Child', { epic_id: epic.id });
    expect(task.epic_id).toBe(epic.id);
  });

  it('lists tasks for an epic', () => {
    const epic = store.createEpic('E');
    store.createTask('T1', { epic_id: epic.id });
    store.createTask('T2', { epic_id: epic.id });
    store.createTask('Other');

    const tasks = store.listTasks({ epic_id: epic.id });
    expect(tasks).toHaveLength(2);
  });

  it('lists tasks by status', () => {
    store.createTask('Pending');
    const t = store.createTask('In progress');
    store.updateTask(t.id, { status: 'in_progress' });

    expect(store.listTasks({ status: 'pending' })).toHaveLength(1);
    expect(store.listTasks({ status: 'in_progress' })).toHaveLength(1);
  });

  it('updates a task', () => {
    const task = store.createTask('Original');
    store.updateTask(task.id, { status: 'done', result: 'Success' });
    const updated = store.getTask(task.id);
    expect(updated!.status).toBe('done');
    expect(updated!.result).toBe('Success');
  });
});

describe('PlanningStore — Summary', () => {
  it('returns empty string when no epics', () => {
    expect(store.activeSummary()).toBe('');
  });

  it('summarizes active work', () => {
    const epic = store.createEpic('Build bridge', { priority: 'P1' });
    store.createTask('Write code', { epic_id: epic.id });
    const t2 = store.createTask('Write tests', { epic_id: epic.id });
    store.updateTask(t2.id, { status: 'done' });

    const summary = store.activeSummary();
    expect(summary).toContain('Build bridge');
    expect(summary).toContain('1/2 tâches');
    expect(summary).toContain('○ Write code');
    expect(summary).not.toContain('Write tests'); // done, not shown
  });

  it('shows in_progress tasks with arrow', () => {
    const epic = store.createEpic('E');
    const t = store.createTask('Active', { epic_id: epic.id });
    store.updateTask(t.id, { status: 'in_progress' });

    expect(store.activeSummary()).toContain('→ Active');
  });
});
