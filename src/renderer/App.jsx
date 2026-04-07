import { useEffect, useState } from 'react';
import { createTranslator } from '../core/locales.js';
import { AVAILABLE_LOCALES } from '../core/localeConfig.js';

function useOperatorSnapshot(api) {
  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    if (!api) {
      return () => {};
    }

    api.getSnapshot().then((next) => {
      if (active) {
        setSnapshot(next);
      }
    });

    unsubscribe = api.subscribe((next) => {
      setSnapshot(next);
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [api]);

  return [snapshot, setSnapshot];
}

function formatDateTime(locale, value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(locale === 'zh-TW' ? 'zh-TW' : 'en', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

function statusClass(status) {
  return `status-badge status-${String(status).replaceAll(' ', '-')}`;
}

function PermissionToggle({ label, checked, onChange, disabled = false }) {
  return (
    <label className={`permission-toggle ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}

function Section({ title, subtitle, actions = null, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

function TaskStatus({ t, status }) {
  return <span className={statusClass(status)}>{t(`status.${status}`) ?? status}</span>;
}

function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {hint ? <span className="stat-hint">{hint}</span> : null}
    </div>
  );
}

function TaskListItem({ task, selected, onSelect, t }) {
  return (
    <button className={`task-row ${selected ? 'selected' : ''}`} onClick={() => onSelect(task.id)}>
      <div className="task-row-top">
        <strong>{task.title}</strong>
        <TaskStatus t={t} status={task.status} />
      </div>
      <p>{task.objective || t('misc.empty')}</p>
      <div className="task-row-meta">
        <span>{task.scope === 'orchestrator' ? t('labels.orchestratorScope') : t('labels.workspaceScope')}</span>
        <span>{t('labels.priority')} {task.priority}</span>
      </div>
    </button>
  );
}

function WorkspacePickerItem({ workspace, active, t, onSelect }) {
  return (
    <button className={`workspace-row ${active ? 'selected' : ''}`} onClick={() => onSelect(workspace.id)}>
      <div className="workspace-row-top">
        <div>
          <strong>{workspace.name}</strong>
          <p>{workspace.description || t('misc.empty')}</p>
        </div>
        {active ? <span className="pill success">{t('labels.activeWorkspace')}</span> : null}
      </div>
      <div className="workspace-row-meta">
        <code>{workspace.path || t('misc.empty')}</code>
        <small>
          {t('labels.providerMode')}: {t(`labels.${workspace.providerMode}`) ?? workspace.providerMode}
        </small>
        <small>
          {t('labels.runnerMode')}: {t(`labels.${workspace.runnerMode}`) ?? workspace.runnerMode}
        </small>
      </div>
    </button>
  );
}

function LogLine({ entry, locale }) {
  return (
    <li className={`log-line log-${entry.level}`}>
      <span className="log-timestamp">{formatDateTime(locale, entry.timestamp)}</span>
      <span className="log-message">{entry.message}</span>
    </li>
  );
}

function TaskStep({ step, result, t, locale }) {
  return (
    <div className="step">
      <div className="step-head">
        <strong>{step.title}</strong>
        <span>{t(`permissions.${step.permission}`) ?? step.permission}</span>
      </div>
      <div className="step-body">
        <span>{step.role}</span>
        <span>{step.kind}</span>
        {result ? <span>{result.status}</span> : <span>{t('misc.pending')}</span>}
      </div>
      {step.note ? <p>{step.note}</p> : null}
      {result?.stdout ? <pre>{result.stdout}</pre> : null}
      {result?.stderr ? <pre className="error">{result.stderr}</pre> : null}
      {result ? <small>{formatDateTime(locale, result.finishedAt)}</small> : null}
    </div>
  );
}

export function OperatorApp({ api }) {
  const [snapshot] = useOperatorSnapshot(api);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [draft, setDraft] = useState({
    title: '',
    objective: '',
    scope: 'workspace',
    priority: 3,
  });

  const locale = snapshot?.settings?.locale ?? 'en';
  const t = createTranslator(locale);

  useEffect(() => {
    if (!snapshot) return;
    if (!selectedTaskId && snapshot.tasks?.length > 0) {
      setSelectedTaskId(snapshot.tasks[0].id);
    }
  }, [snapshot, selectedTaskId]);

  const tasks = snapshot?.tasks ?? [];
  const approvals = snapshot?.approvals ?? [];
  const logs = snapshot?.logs ?? [];
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? tasks[0] ?? null;
  const activeTask = tasks.find((task) => task.id === snapshot?.system?.activeTaskId) ?? null;
  const workspaces = snapshot?.workspaces ?? [];
  const taskTemplates = snapshot?.taskTemplates ?? [];
  const activeWorkspaceId = snapshot?.settings?.activeWorkspaceId ?? workspaces[0]?.id ?? null;
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? workspaces[0] ?? null;
  const activeTemplate = taskTemplates.find((template) => template.workspaceId === activeWorkspace?.id) ?? taskTemplates[0] ?? null;

  const stats = {
    queue: tasks.filter((task) => task.status === 'queued').length,
    approvals: approvals.filter((approval) => approval.decision === 'pending').length,
    active: activeTask ? 1 : 0,
    completed: tasks.filter((task) => task.status === 'completed').length,
    blocked: tasks.filter((task) => task.status === 'blocked').length,
    failed: tasks.filter((task) => task.status === 'failed').length,
  };

  async function enqueueTask() {
    if (!api || !draft.title.trim()) return;
    await api.createTask({
      title: draft.title.trim(),
      objective: draft.objective.trim(),
      scope: draft.scope,
      priority: Number(draft.priority),
      workspacePath: activeWorkspace?.path ?? snapshot?.settings?.workspacePath ?? '',
    });
    setDraft({
      title: '',
      objective: '',
      scope: 'workspace',
      priority: 3,
    });
  }

  async function updateSettings(patch) {
    if (!api) return;
    await api.updateSettings(patch);
  }

  async function onBrowseWorkspace() {
    if (!api) return;
    const selected = await api.selectWorkspace();
    if (selected) {
      if (activeWorkspace) {
        await api.updateWorkspace(activeWorkspace.id, { path: selected });
      } else {
        await api.createWorkspace({ path: selected });
      }
    }
  }

  async function createWorkspaceFromFolder() {
    if (!api) return;
    const selected = await api.selectWorkspace();
    if (!selected) return;
    await api.createWorkspace({ path: selected });
  }

  if (!snapshot) {
    return (
      <div className="shell loading">
        <div className="loading-card">
          <h1>{t('app.title')}</h1>
          <p>{t('app.description')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{t('nav.overview')}</p>
          <h1>{t('app.title')}</h1>
          <p className="subtitle">{t('app.subtitle')}</p>
          <p className="description">{t('app.description')}</p>
        </div>

        <div className="hero-tools">
          <div className="locale-switch">
            {AVAILABLE_LOCALES.map((option) => (
              <button
                key={option}
                className={option === locale ? 'chip selected' : 'chip'}
                onClick={() => api?.setLocale(option)}
              >
                {option === 'en' ? 'EN' : '繁中'}
              </button>
            ))}
          </div>

          <button className="chip action" onClick={() => (snapshot.settings.paused ? api?.resume() : api?.pause())}>
            {snapshot.settings.paused ? t('controls.resume') : t('controls.pause')}
          </button>
          <button className="chip" onClick={() => api?.toggleAutoLoop()}>
            {t('controls.autoLoop')}: {snapshot.settings.autoLoop ? t('misc.on') : t('misc.off')}
          </button>
          <button className="chip" onClick={() => api?.runOnce()}>
            {t('controls.runNow')}
          </button>
          <button className="chip" onClick={() => api?.seedDemoTasks()}>
            {t('controls.seedDemo')}
          </button>
        </div>
      </header>

      <section className="stats-row">
        <Stat label={t('labels.queueDepth')} value={stats.queue} hint={snapshot.settings.paused ? t('labels.pausedState') : t('misc.connected')} />
        <Stat label={t('labels.activeTask')} value={stats.active} hint={activeTask ? activeTask.title : t('misc.idle')} />
        <Stat label={t('labels.completed')} value={stats.completed} hint={t('misc.enabled')} />
        <Stat label={t('labels.blocked')} value={stats.blocked} hint={t('misc.blockedByPolicy')} />
        <Stat label={t('labels.failed')} value={stats.failed} hint={t('misc.pending')} />
      </section>

      <main className="workspace">
        <div className="workspace-grid">
          <Section
            title={t('sections.intake')}
            subtitle={t('app.description')}
            actions={(
              <>
                <button className="button ghost" onClick={() => api?.seedDemoTasks()}>
                  {t('controls.seedDemo')}
                </button>
                <button className="button accent" onClick={() => api?.seedWorkspaceTask()}>
                  {t('controls.seedWorkspaceTemplate')}
                </button>
              </>
            )}
          >
            <div className="form-grid">
              <label>
                <span>{t('labels.title')}</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  placeholder={t('labels.title')}
                />
              </label>
              <label className="span-2">
                <span>{t('labels.objective')}</span>
                <textarea
                  value={draft.objective}
                  onChange={(event) => setDraft({ ...draft, objective: event.target.value })}
                  placeholder={t('labels.objective')}
                  rows={4}
                />
              </label>
              <label>
                <span>{t('labels.scope')}</span>
                <select value={draft.scope} onChange={(event) => setDraft({ ...draft, scope: event.target.value })}>
                  <option value="workspace">{t('labels.workspaceScope')}</option>
                  <option value="orchestrator">{t('labels.orchestratorScope')}</option>
                </select>
              </label>
              <label>
                <span>{t('labels.priority')}</span>
                <input
                  type="number"
                  min="1"
                  max="5"
                  value={draft.priority}
                  onChange={(event) => setDraft({ ...draft, priority: event.target.value })}
                />
              </label>
            </div>

            <div className="inline-actions">
              <button className="button accent" onClick={enqueueTask}>
                {t('controls.addTask')}
              </button>
            </div>
          </Section>

          <Section
            title={t('sections.tasks')}
            subtitle={t('labels.queueDepth') + ': ' + stats.queue}
            className="task-section"
          >
            <div className="task-list">
              {tasks.length === 0 ? (
                <p className="empty-state">{t('labels.noTasks')}</p>
              ) : (
                tasks.map((task) => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    selected={selectedTask?.id === task.id}
                    onSelect={setSelectedTaskId}
                    t={t}
                  />
                ))
              )}
            </div>
          </Section>

          <Section
            title={t('sections.details')}
            subtitle={selectedTask ? selectedTask.title : t('labels.noTasks')}
            className="detail-section"
            actions={
              selectedTask ? (
                <>
                  {selectedTask.status === 'waiting-approval' ? (
                    <>
                      <button className="button accent" onClick={() => api?.approveTask({ taskId: selectedTask.id, approvalId: selectedTask.pendingApprovalId })}>
                        {t('controls.approve')}
                      </button>
                      <button className="button ghost" onClick={() => api?.rejectTask({ taskId: selectedTask.id, approvalId: selectedTask.pendingApprovalId })}>
                        {t('controls.reject')}
                      </button>
                    </>
                  ) : null}
                  {(selectedTask.status === 'failed' || selectedTask.status === 'blocked') ? (
                    <button className="button ghost" onClick={() => api?.runOnce()}>
                      {t('controls.retry')}
                    </button>
                  ) : null}
                </>
              ) : null
            }
          >
            {selectedTask ? (
              <div className="detail-stack">
                <div className="detail-meta">
                  <div>
                    <span>{t('labels.status')}</span>
                    <TaskStatus t={t} status={selectedTask.status} />
                  </div>
                  <div>
                    <span>{t('labels.workspace')}</span>
                    <strong>{selectedTask.workspacePath || snapshot.settings.workspacePath || '—'}</strong>
                  </div>
                  <div>
                    <span>{t('labels.priority')}</span>
                    <strong>{selectedTask.priority}</strong>
                  </div>
                  <div>
                    <span>{t('labels.resumeFrom')}</span>
                    <strong>{selectedTask.resumeFromStepIndex}</strong>
                  </div>
                  <div>
                    <span>{t('labels.sourceTask')}</span>
                    <strong>{selectedTask.sourceTaskId || '—'}</strong>
                  </div>
                  <div>
                    <span>{t('labels.autoGenerated')}</span>
                    <strong>{selectedTask.autoGenerated ? t('misc.enabled') : t('misc.disabled')}</strong>
                  </div>
                </div>

                {selectedTask.plan ? (
                  <div className="plan-block">
                    <h3>{t('labels.currentPlan')}</h3>
                    <p>{selectedTask.plan.summary}</p>
                    {selectedTask.plan.workerPrompt ? <pre>{selectedTask.plan.workerPrompt}</pre> : null}
                    {selectedTask.plan.reviewPrompt ? <pre>{selectedTask.plan.reviewPrompt}</pre> : null}
                  </div>
                ) : null}

                <div className="steps-block">
                  <h3>{t('sections.tasks')}</h3>
                  <div className="steps-list">
                    {selectedTask.steps.length === 0 ? (
                      <p className="empty-state">{t('misc.empty')}</p>
                    ) : (
                      selectedTask.steps.map((step, index) => (
                        <TaskStep
                          key={step.id ?? `${step.title}-${index}`}
                          step={step}
                          result={selectedTask.stepResults.find((entry) => entry.stepId === step.id)}
                          t={t}
                          locale={locale}
                        />
                      ))
                    )}
                  </div>
                </div>

                {selectedTask.review ? (
                  <div className="review-block">
                    <h3>{t('labels.review')}</h3>
                    <p>{selectedTask.review.notes}</p>
                    <div className="review-flags">
                      <span className={selectedTask.review.approved ? 'pill success' : 'pill warn'}>
                        {selectedTask.review.approved ? t('misc.approved') : t('misc.rejected')}
                      </span>
                      {selectedTask.review.needsFollowUp ? (
                        <span className="pill">{t('misc.followUp')}</span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="empty-state">{t('labels.noTasks')}</p>
            )}
          </Section>

          <Section
            title={t('sections.approvals')}
            subtitle={t('labels.waitingApproval')}
            className="approvals-section"
          >
            <div className="approval-list">
              {approvals.filter((approval) => approval.decision === 'pending').length === 0 ? (
                <p className="empty-state">{t('labels.noApprovals')}</p>
              ) : (
                approvals
                  .filter((approval) => approval.decision === 'pending')
                  .map((approval) => {
                    const task = tasks.find((entry) => entry.id === approval.taskId);
                    return (
                      <div key={approval.id} className="approval-item">
                        <div className="approval-copy">
                          <strong>{task?.title || approval.taskId}</strong>
                          <p>{approval.reason}</p>
                          <small>{approval.action}</small>
                        </div>
                        <div className="approval-actions">
                          <button className="button accent" onClick={() => api?.approveTask({ taskId: approval.taskId, approvalId: approval.id })}>
                            {t('controls.approve')}
                          </button>
                          <button className="button ghost" onClick={() => api?.rejectTask({ taskId: approval.taskId, approvalId: approval.id })}>
                            {t('controls.reject')}
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </Section>

          <Section
            title={t('sections.settings')}
            subtitle={activeWorkspace
              ? `${t('labels.activeWorkspace')}: ${activeWorkspace.name} · ${activeWorkspace.path || t('misc.empty')}`
              : t('misc.empty')}
            className="settings-section"
            actions={(
              <>
                <button className="button ghost" onClick={() => api?.createWorkspace()}>
                  {t('controls.newWorkspace')}
                </button>
                <button className="button ghost" onClick={createWorkspaceFromFolder}>
                  {t('controls.importWorkspace')}
                </button>
              </>
            )}
          >
            <div className="workspace-dashboard">
              <div className="workspace-picker">
                <div className="workspace-picker-head">
                  <div>
                    <span>{t('sections.workspaces')}</span>
                    <strong>{activeWorkspace?.name ?? t('misc.empty')}</strong>
                    <p>{activeWorkspace?.path || t('misc.empty')}</p>
                  </div>
                  <button className="button accent" onClick={onBrowseWorkspace}>
                    {t('controls.browse')}
                  </button>
                </div>

                <div className="workspace-list">
                  {workspaces.map((workspace) => (
                    <WorkspacePickerItem
                      key={workspace.id}
                      workspace={workspace}
                      active={workspace.id === activeWorkspace?.id}
                      t={t}
                      onSelect={(workspaceId) => api?.setActiveWorkspace(workspaceId)}
                    />
                  ))}
                </div>
              </div>

              <div className="workspace-editors">
                <div className="workspace-card workspace-editor">
                  <span>{t('sections.workspaceEditor')}</span>
                  <strong>{activeWorkspace?.name ?? t('misc.empty')}</strong>
                  <p>{activeWorkspace?.description || t('misc.empty')}</p>
                  <div className="form-grid settings-grid">
                    <label>
                      <span>{t('labels.name')}</span>
                      <input
                        value={activeWorkspace?.name || ''}
                        onChange={(event) => activeWorkspace && api?.updateWorkspace(activeWorkspace.id, { name: event.target.value })}
                        placeholder={t('labels.name')}
                      />
                    </label>

                    <label className="span-2">
                      <span>{t('labels.description')}</span>
                      <textarea
                        value={activeWorkspace?.description || ''}
                        onChange={(event) => activeWorkspace && api?.updateWorkspace(activeWorkspace.id, { description: event.target.value })}
                        placeholder={t('labels.description')}
                        rows={3}
                      />
                    </label>

                    <label className="span-2">
                      <span>{t('labels.path')}</span>
                      <input
                        value={activeWorkspace?.path || ''}
                        onChange={(event) => activeWorkspace && api?.updateWorkspace(activeWorkspace.id, { path: event.target.value })}
                        placeholder="/Users/you/project"
                      />
                    </label>

                    <label>
                      <span>{t('labels.providerMode')}</span>
                      <select
                        value={activeWorkspace?.providerMode || 'scripted'}
                        onChange={(event) => activeWorkspace && api?.updateWorkspace(activeWorkspace.id, { providerMode: event.target.value })}
                      >
                        <option value="scripted">{t('labels.scripted')}</option>
                        <option value="command">{t('labels.command')}</option>
                      </select>
                    </label>

                    <label className="span-2">
                      <span>{t('labels.providerCommand')}</span>
                      <input
                        value={activeWorkspace?.providerCommand || ''}
                        onChange={(event) => activeWorkspace && api?.updateWorkspace(activeWorkspace.id, { providerCommand: event.target.value })}
                        placeholder="node ./scripts/codex-provider.mjs"
                      />
                    </label>

                    <label>
                      <span>{t('labels.providerTimeout')}</span>
                      <input
                        type="number"
                        min="1000"
                        value={activeWorkspace?.providerTimeoutMs ?? snapshot.settings.providerTimeoutMs}
                        onChange={(event) => activeWorkspace && api?.updateWorkspace(activeWorkspace.id, { providerTimeoutMs: Number(event.target.value) })}
                      />
                    </label>

                    <label>
                      <span>{t('labels.runnerMode')}</span>
                      <select
                        value={activeWorkspace?.runnerMode || 'simulated'}
                        onChange={(event) => activeWorkspace && api?.updateWorkspace(activeWorkspace.id, { runnerMode: event.target.value })}
                      >
                        <option value="simulated">{t('labels.simulated')}</option>
                        <option value="shell">{t('labels.shell')}</option>
                      </select>
                    </label>

                    <label className="span-2">
                      <span>{t('labels.runnerCommand')}</span>
                      <input
                        value={activeWorkspace?.runnerCommand || ''}
                        onChange={(event) => activeWorkspace && api?.updateWorkspace(activeWorkspace.id, { runnerCommand: event.target.value })}
                        placeholder="pnpm test"
                      />
                    </label>

                    <label>
                      <span>{t('labels.runnerTimeout')}</span>
                      <input
                        type="number"
                        min="1000"
                        value={activeWorkspace?.runnerTimeoutMs ?? snapshot.settings.runnerTimeoutMs}
                        onChange={(event) => activeWorkspace && api?.updateWorkspace(activeWorkspace.id, { runnerTimeoutMs: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                </div>

                <div className="workspace-card template-editor">
                  <span>{t('sections.templateEditor')}</span>
                  <strong>{activeTemplate?.title ?? t('labels.workspaceTemplate')}</strong>
                  <p>{activeTemplate?.description || t('misc.empty')}</p>
                  <div className="form-grid settings-grid">
                    <label>
                      <span>{t('labels.title')}</span>
                      <input
                        value={activeTemplate?.title || ''}
                        onChange={(event) => activeTemplate && api?.updateWorkspaceTemplate(activeTemplate.id, { title: event.target.value })}
                        placeholder={t('labels.title')}
                      />
                    </label>

                    <label className="span-2">
                      <span>{t('labels.objective')}</span>
                      <textarea
                        value={activeTemplate?.objective || ''}
                        onChange={(event) => activeTemplate && api?.updateWorkspaceTemplate(activeTemplate.id, { objective: event.target.value })}
                        placeholder={t('labels.objective')}
                        rows={4}
                      />
                    </label>

                    <label className="span-2">
                      <span>{t('labels.description')}</span>
                      <textarea
                        value={activeTemplate?.description || ''}
                        onChange={(event) => activeTemplate && api?.updateWorkspaceTemplate(activeTemplate.id, { description: event.target.value })}
                        placeholder={t('labels.description')}
                        rows={3}
                      />
                    </label>

                    <label>
                      <span>{t('labels.scope')}</span>
                      <select
                        value={activeTemplate?.scope || 'workspace'}
                        onChange={(event) => activeTemplate && api?.updateWorkspaceTemplate(activeTemplate.id, { scope: event.target.value })}
                      >
                        <option value="workspace">{t('labels.workspaceScope')}</option>
                        <option value="orchestrator">{t('labels.orchestratorScope')}</option>
                      </select>
                    </label>

                    <label>
                      <span>{t('labels.kind')}</span>
                      <input
                        value={activeTemplate?.kind || ''}
                        onChange={(event) => activeTemplate && api?.updateWorkspaceTemplate(activeTemplate.id, { kind: event.target.value })}
                        placeholder={t('labels.kind')}
                      />
                    </label>

                    <label>
                      <span>{t('labels.priority')}</span>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={activeTemplate?.priority ?? 3}
                        onChange={(event) => activeTemplate && api?.updateWorkspaceTemplate(activeTemplate.id, { priority: Number(event.target.value) })}
                      />
                    </label>

                    <label>
                      <span>{t('labels.providerMode')}</span>
                      <select
                        value={activeTemplate?.providerMode || 'command'}
                        onChange={(event) => activeTemplate && api?.updateWorkspaceTemplate(activeTemplate.id, { providerMode: event.target.value })}
                      >
                        <option value="scripted">{t('labels.scripted')}</option>
                        <option value="command">{t('labels.command')}</option>
                      </select>
                    </label>

                    <label className="span-2">
                      <span>{t('labels.providerCommand')}</span>
                      <input
                        value={activeTemplate?.providerCommand || ''}
                        onChange={(event) => activeTemplate && api?.updateWorkspaceTemplate(activeTemplate.id, { providerCommand: event.target.value })}
                        placeholder="node ./scripts/codex-provider.mjs"
                      />
                    </label>

                    <label>
                      <span>{t('labels.providerTimeout')}</span>
                      <input
                        type="number"
                        min="1000"
                        value={activeTemplate?.providerTimeoutMs ?? snapshot.settings.providerTimeoutMs}
                        onChange={(event) => activeTemplate && api?.updateWorkspaceTemplate(activeTemplate.id, { providerTimeoutMs: Number(event.target.value) })}
                      />
                    </label>

                    <label>
                      <span>{t('labels.runnerMode')}</span>
                      <select
                        value={activeTemplate?.runnerMode || 'shell'}
                        onChange={(event) => activeTemplate && api?.updateWorkspaceTemplate(activeTemplate.id, { runnerMode: event.target.value })}
                      >
                        <option value="simulated">{t('labels.simulated')}</option>
                        <option value="shell">{t('labels.shell')}</option>
                      </select>
                    </label>

                    <label className="span-2">
                      <span>{t('labels.runnerCommand')}</span>
                      <input
                        value={activeTemplate?.runnerCommand || ''}
                        onChange={(event) => activeTemplate && api?.updateWorkspaceTemplate(activeTemplate.id, { runnerCommand: event.target.value })}
                        placeholder="pnpm test"
                      />
                    </label>

                    <label>
                      <span>{t('labels.runnerTimeout')}</span>
                      <input
                        type="number"
                        min="1000"
                        value={activeTemplate?.runnerTimeoutMs ?? snapshot.settings.runnerTimeoutMs}
                        onChange={(event) => activeTemplate && api?.updateWorkspaceTemplate(activeTemplate.id, { runnerTimeoutMs: Number(event.target.value) })}
                      />
                    </label>
                  </div>

                  <div className="inline-actions">
                    <button className="button accent" onClick={() => api?.seedWorkspaceTask(activeTemplate?.id ?? null)}>
                      {t('controls.seedCurrentTemplate')}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="toggle-row">
              <PermissionToggle
                label={t('labels.autoLoop')}
                checked={snapshot.settings.autoLoop}
                onChange={(checked) => updateSettings({ autoLoop: checked })}
              />
              <PermissionToggle
                label={t('labels.paused')}
                checked={snapshot.settings.paused}
                onChange={(checked) => updateSettings({ paused: checked })}
              />
              <PermissionToggle
                label={t('labels.highRiskApproval')}
                checked={snapshot.settings.requireHighRiskApproval}
                onChange={(checked) => updateSettings({ requireHighRiskApproval: checked })}
              />
            </div>

            <div className="form-grid settings-grid">
              <label>
                <span>{t('labels.maxRetries')}</span>
                <input
                  type="number"
                  min="0"
                  value={snapshot.settings.maxRetries}
                  onChange={(event) => updateSettings({ maxRetries: Number(event.target.value) })}
                />
              </label>
            </div>

            <div className="permissions-grid">
              {Object.entries(snapshot.settings.permissions).map(([key, value]) => (
                <PermissionToggle
                  key={key}
                  label={t(`permissions.${key}`)}
                  checked={Boolean(value)}
                  onChange={(checked) => updateSettings({ permissions: { [key]: checked } })}
                  disabled={key === 'read'}
                />
              ))}
            </div>
          </Section>

          <Section
            title={t('sections.logs')}
            subtitle={formatDateTime(locale, snapshot.system.lastTickAt)}
            className="logs-section"
          >
            <ul className="log-list">
              {logs.length === 0 ? (
                <p className="empty-state">{t('labels.noLogs')}</p>
              ) : (
                logs.slice(0, 80).map((entry) => <LogLine key={entry.id} entry={entry} locale={locale} />)
              )}
            </ul>
          </Section>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const api = typeof window !== 'undefined' ? window.operator : null;
  return <OperatorApp api={api} />;
}

export { useOperatorSnapshot };
