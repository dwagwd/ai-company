import { useEffect, useMemo, useState } from 'react';
import { createTranslator } from '../core/locales.js';
import { AVAILABLE_LOCALES } from '../core/localeConfig.js';
import { buildCompanyBoard } from './companyBoard.js';

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
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusClass(status) {
  return `status-badge status-${String(status).replaceAll(' ', '-')}`;
}

function statusSlug(status) {
  return `status-${String(status).replaceAll(' ', '-')}`;
}

function accentClass(accent = '') {
  return `accent-${String(accent).replaceAll(' ', '-')}`;
}

function stageLabel(t, stageId) {
  return t(`labels.${stageId}Stage`);
}

function pipelineStateLabel(t, state) {
  if (state === 'active') {
    return t('labels.pipelineNow');
  }

  if (state === 'completed') {
    return t('labels.pipelineDone');
  }

  return t('labels.pipelineNext');
}

function pipelineStateForIndex(index, activeIndex) {
  if (index < activeIndex) {
    return 'completed';
  }

  if (index === activeIndex) {
    return 'active';
  }

  return 'upcoming';
}

function pipelineStageIndex(pipelineStages, missionId) {
  return pipelineStages.findIndex((stage) => stage.missions.some((mission) => mission.id === missionId));
}

function agentAvatar(agent) {
  return agent.avatar || String(agent.name || agent.id || 'AI').slice(0, 2).toUpperCase();
}

function ProgressBar({ value = 0 }) {
  return (
    <div className="progress-track" aria-hidden="true">
      <span className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
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
    <section className={`panel board-section ${className}`}>
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

function MetricTile({ label, value, hint }) {
  return (
    <article className="metric-tile">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {hint ? <span className="metric-hint">{hint}</span> : null}
    </article>
  );
}

function AgentCard({ agent, t, selected = false }) {
  const tone = agent.status === 'Blocked' ? 'warn' : agent.status === 'Idle' ? 'neutral' : 'success';
  const departmentAccent = agent.department?.accent ?? agent.accent ?? 'cyan';

  return (
    <article className={`agent-card role-panel ${selected ? 'selected' : ''} ${accentClass(departmentAccent)}`}>
      <div className="agent-card-top">
        <div className="agent-avatar" aria-hidden="true">
          <span>{agentAvatar(agent)}</span>
        </div>

        <div className="agent-copy">
          <div className="agent-head">
            <div>
              <span className="agent-name">{agent.name}</span>
              <strong>{agent.title}</strong>
            </div>
            <span className={`pill ${tone}`}>{agent.status}</span>
          </div>

          <div className="agent-identity">
            <span className="rank-chip">
              {t('labels.rank')} {agent.rank ?? '1'}
            </span>
            <span className={`department-chip ${accentClass(departmentAccent)}`}>
              {agent.department?.name ?? t('misc.empty')}
            </span>
            <span className="rank-label">{agent.rankLabel ?? agent.title}</span>
          </div>
        </div>
      </div>

      <div className="agent-meta">
        <span>
          {t('labels.department')}: <strong>{agent.department?.name ?? t('misc.empty')}</strong>
        </span>
        <span>
          {t('labels.specialty')}: <strong>{agent.specialty}</strong>
        </span>
      </div>

      <div className="agent-thought">
        <div>
          <span>{t('labels.currentGoal')}</span>
          <p>{agent.currentGoal || agent.thought.goal}</p>
        </div>
        <div>
          <span>{t('labels.nextAction')}</span>
          <p>{agent.thought.nextAction}</p>
        </div>
        {agent.thought.blocker ? (
          <div>
            <span>{t('labels.blocker')}</span>
            <p>{agent.thought.blocker}</p>
          </div>
        ) : null}
      </div>

      <div className="agent-footer">
        <small>
          {t('labels.currentTask')}: {agent.currentTask || t('misc.idle')}
        </small>
        <small>
          {t('labels.confidence')}: {agent.thought.confidence.label} {agent.thought.confidence.score}%
        </small>
      </div>

      <ProgressBar value={agent.thought.confidence.score} />
    </article>
  );
}

function DepartmentCard({ department, t }) {
  return (
    <article className="department-card">
      <div className="department-head">
        <div>
          <span className="department-name">{department.name}</span>
          <p>{department.description}</p>
        </div>
        <span className="department-count">{department.activeCount}</span>
      </div>

      <div className="department-grid">
        <span>
          {t('labels.workload')} <strong>{department.activeCount}</strong>
        </span>
        <span>
          {t('labels.completed')} <strong>{department.completedCount}</strong>
        </span>
        <span>
          {t('labels.blocked')} <strong>{department.blockedCount}</strong>
        </span>
      </div>

      <small>
        {t('labels.leadAI')}: <strong>{department.lead?.name ?? t('misc.empty')}</strong>
      </small>
    </article>
  );
}

function MissionCard({ mission, t, selected = false, onSelect, compact = false, order = 0 }) {
  return (
    <button
      style={{ '--card-delay': `${Math.min(order, 6) * 72}ms` }}
      className={`mission-card role-card ${compact ? 'compact' : ''} ${selected ? 'selected' : ''} ${statusSlug(mission.status)} pipeline-stage-${mission.pipelineStage.id} ${accentClass(mission.department?.accent ?? mission.owner?.department?.accent ?? 'cyan')}`}
      onClick={() => onSelect(mission.id)}
    >
      <div className="mission-head">
        <div className="mission-head-copy">
          <span className="mission-pipeline-chip">{stageLabel(t, mission.pipelineStage.id)}</span>
          <span className="mission-pipeline-phase">{t(`status.${mission.status}`) ?? mission.status}</span>
          <strong>{mission.title}</strong>
          <p>{mission.objective || t('misc.empty')}</p>
        </div>
        <span className={statusClass(mission.status)}>{t(`status.${mission.status}`) ?? mission.status}</span>
      </div>

      <div className="mission-meta role-meta">
        <span className="owner-chip">
          <span className="owner-avatar" aria-hidden="true">{agentAvatar(mission.owner)}</span>
          <span>
            {t('labels.ownerAI')}: <strong>{mission.owner?.name ?? t('misc.empty')}</strong>
            <small>{mission.owner?.rankLabel ?? mission.owner?.title ?? t('misc.empty')}</small>
          </span>
        </span>
        <span>
          {t('labels.department')}: <strong>{mission.department?.name ?? t('misc.empty')}</strong>
        </span>
        <span>
          {t('labels.currentStage')}: <strong>{mission.stage.label}</strong>
        </span>
      </div>

      <div className="mission-progress">
        <ProgressBar value={mission.progress} />
        <small>{mission.progress}%</small>
      </div>

      <div className="mission-footer">
        <small>{mission.thinking.nextAction}</small>
        <small>
          {t('labels.confidence')}: {mission.confidence.label} {mission.confidence.score}%
        </small>
      </div>
    </button>
  );
}

function MissionDetail({ mission, pipelineStages, t, locale }) {
  if (!mission) {
    return <p className="empty-state">{t('labels.noTasks')}</p>;
  }

  const selectedStageIndex = pipelineStageIndex(pipelineStages, mission.id);
  const safeSelectedStageIndex = selectedStageIndex >= 0 ? selectedStageIndex : 0;

  return (
    <div className={`mission-detail stage-${mission.pipelineStage.id}`} aria-live="polite">
      <div className="mission-detail-top">
        <div>
          <div className="mission-flow">
            {pipelineStages.map((stage, index) => (
              <span
                key={stage.id}
                className={`mission-flow-step ${pipelineStateForIndex(index, safeSelectedStageIndex)} ${stage.id === mission.pipelineStage.id ? 'active' : ''}`}
              >
                {stageLabel(t, stage.id)}
              </span>
            ))}
          </div>
          <div className="mission-detail-tag-row">
            <span className="mission-detail-tag">{stageLabel(t, mission.pipelineStage.id)}</span>
            <span className="mission-detail-tag secondary">{mission.stage.label}</span>
          </div>
          <h3>{mission.title}</h3>
          <p>{mission.objective || t('misc.empty')}</p>
        </div>
        <div className="mission-detail-owner">
          <span>{t('labels.ownerAI')}</span>
          <strong>{mission.owner?.name ?? t('misc.empty')}</strong>
          <small>{mission.owner?.title ?? t('misc.empty')}</small>
          <div className="mission-owner-meta">
            <span className="rank-chip">
              {t('labels.rank')} {mission.owner?.rank ?? '1'}
            </span>
            <span className={`department-chip ${accentClass(mission.department?.accent ?? mission.owner?.department?.accent ?? 'cyan')}`}>
              {mission.department?.name ?? t('misc.empty')}
            </span>
          </div>
        </div>
      </div>

      <div className="mission-detail-meta">
        <div>
          <span>{t('labels.department')}</span>
          <strong>{mission.department?.name ?? t('misc.empty')}</strong>
        </div>
        <div>
          <span>{t('labels.currentTask')}</span>
          <strong>{mission.currentStep?.title || mission.thinking.nextAction}</strong>
        </div>
        <div>
          <span>{t('labels.confidence')}</span>
          <strong>{mission.confidence.label} {mission.confidence.score}%</strong>
        </div>
        <div>
          <span>{t('labels.review')}</span>
          <strong>{mission.review?.approved ? t('misc.approved') : mission.review ? t('misc.rejected') : t('misc.pending')}</strong>
        </div>
      </div>

      <div className="mission-detail-grid">
        <div className="mission-detail-block">
          <span>{t('labels.thinking')}</span>
          <dl>
            <div>
              <dt>{t('labels.currentGoal')}</dt>
              <dd>{mission.thinking.goal}</dd>
            </div>
            <div>
              <dt>{t('labels.rationale')}</dt>
              <dd>{mission.thinking.rationale}</dd>
            </div>
            <div>
              <dt>{t('labels.blocker')}</dt>
              <dd>{mission.thinking.blocker || t('misc.empty')}</dd>
            </div>
            <div>
              <dt>{t('labels.nextAction')}</dt>
              <dd>{mission.thinking.nextAction}</dd>
            </div>
          </dl>
        </div>

        <div className="mission-detail-block">
          <span>{t('labels.acceptanceCriteria')}</span>
          <ul className="criteria-list">
            {mission.acceptanceCriteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mission-detail-grid lower">
        <div className="mission-detail-block">
          <span>{t('labels.subgoals')}</span>
          <div className="subgoal-list">
            {mission.subgoals.length === 0 ? (
              <p className="empty-state">{t('misc.empty')}</p>
            ) : (
              mission.subgoals.map((subgoal) => (
                <div key={subgoal.id} className="subgoal-row">
                  <strong>{subgoal.title}</strong>
                  <span>{subgoal.role}</span>
                  <small>{subgoal.status}</small>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mission-detail-block">
          <span>{t('labels.reviewOutcome')}</span>
          {mission.review ? (
            <div className="review-outcome">
              <span className={mission.review.approved ? 'pill success' : 'pill warn'}>
                {mission.review.approved ? t('misc.approved') : t('misc.rejected')}
              </span>
              <p>{mission.review.notes}</p>
              <small>{formatDateTime(locale, mission.updatedAt)}</small>
            </div>
          ) : (
            <p className="empty-state">{t('misc.pending')}</p>
          )}
        </div>
      </div>

      <div className="mission-detail-progress">
        <ProgressBar value={mission.progress} />
        <small>{mission.progress}%</small>
      </div>
    </div>
  );
}

function PipelineTrack({ pipelineStages, selectedMissionId, onSelectMission, t }) {
  const activeStageIndex = pipelineStageIndex(pipelineStages, selectedMissionId);
  const safeActiveStageIndex = activeStageIndex >= 0 ? activeStageIndex : 0;
  const trackProgress = pipelineStages.length > 0
    ? `${((safeActiveStageIndex + 1) / pipelineStages.length) * 100}%`
    : '0%';

  return (
    <div className="pipeline-track" style={{ '--pipeline-progress': trackProgress }}>
      {pipelineStages.map((stage, index) => {
        const firstMission = stage.missions[0] ?? null;
        const active = stage.missions.some((mission) => mission.id === selectedMissionId);
        const state = pipelineStateForIndex(index, safeActiveStageIndex);

        return (
          <button
            key={stage.id}
            className={`pipeline-node ${state} ${active ? 'active' : ''} ${accentClass(stage.accent)}`}
            aria-label={stageLabel(t, stage.id)}
            aria-pressed={active}
            aria-current={active ? 'step' : undefined}
            onClick={() => firstMission && onSelectMission(firstMission.id)}
            disabled={!firstMission}
          >
            <div className="pipeline-node-head">
              <span>{stageLabel(t, stage.id)}</span>
              <strong>{stage.count}</strong>
            </div>
            <small>{stage.subtitle}</small>
            <em className={`pipeline-node-phase ${state}`}>{pipelineStateLabel(t, state)}</em>
          </button>
        );
      })}
    </div>
  );
}

function PipelineLane({ stage, t, selectedMissionId, onSelectMission }) {
  const active = stage.missions.some((mission) => mission.id === selectedMissionId);

  return (
    <section className={`pipeline-lane ${accentClass(stage.accent)} ${stage.id} ${active ? 'active' : ''}`}>
      <header className="pipeline-lane-head">
        <div>
          <span className="pipeline-lane-label">{stageLabel(t, stage.id)}</span>
          <p>{stage.subtitle}</p>
        </div>
        <span className="pipeline-lane-count">{stage.count}</span>
      </header>

      <div className="pipeline-lane-body">
        {stage.missions.length === 0 ? (
          <p className="empty-state">{t('labels.noTasks')}</p>
        ) : (
          stage.missions.map((mission, index) => (
            <MissionCard
              key={mission.id}
              mission={mission}
              t={t}
              selected={selectedMissionId === mission.id}
              onSelect={onSelectMission}
              compact
              order={index}
            />
          ))
        )}
      </div>
    </section>
  );
}

function ArchiveItem({ mission, t, locale, onSelect }) {
  return (
    <button className="archive-item" onClick={() => onSelect(mission.id)}>
      <div className="archive-copy">
        <div className="archive-top">
          <strong>{mission.title}</strong>
          <span className="stamp">{t('misc.approved')}</span>
        </div>
        <p>{mission.review?.notes || mission.objective}</p>
        <small>{formatDateTime(locale, mission.updatedAt)}</small>
      </div>
      <div className="archive-meta">
        <span>{mission.owner?.name ?? t('misc.empty')}</span>
        <span>{mission.department?.name ?? t('misc.empty')}</span>
      </div>
    </button>
  );
}

function ApprovalItem({ approval, task, t, onApprove, onReject }) {
  return (
    <div className="approval-item">
      <div className="approval-copy">
        <strong>{task?.title || approval.taskId}</strong>
        <p>{approval.reason}</p>
        <small>{task?.owner?.name ?? approval.action}</small>
      </div>
      <div className="approval-actions">
        <button className="button accent" onClick={onApprove}>
          {t('controls.approve')}
        </button>
        <button className="button ghost" onClick={onReject}>
          {t('controls.reject')}
        </button>
      </div>
    </div>
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

function ManagementPanel({
  board,
  snapshot,
  draft,
  setDraft,
  api,
  t,
  managementOpen,
  onToggle,
}) {
  async function updateSettings(patch) {
    if (!api) return;
    await api.updateSettings(patch);
  }

  async function onBrowseWorkspace() {
    if (!api) return;
    const selected = await api.selectWorkspace();
    if (selected) {
      if (board.activeWorkspace) {
        await api.updateWorkspace(board.activeWorkspace.id, { path: selected });
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

  async function enqueueTask() {
    if (!api || !draft.title.trim()) return;
    await api.createTask({
      title: draft.title.trim(),
      objective: draft.objective.trim(),
      scope: draft.scope,
      priority: Number(draft.priority),
      workspacePath: board.activeWorkspace?.path ?? snapshot.settings.workspacePath ?? '',
    });
    setDraft({
      title: '',
      objective: '',
      scope: 'workspace',
      priority: 3,
    });
  }

  return (
    <section className={`management-panel ${managementOpen ? 'open' : ''}`}>
      <div className="management-head">
        <div>
          <span>{t('sections.management')}</span>
          <strong>{board.activeWorkspace?.name ?? t('misc.empty')}</strong>
          <p>{board.activeTemplate?.description || t('misc.empty')}</p>
        </div>
        <button className="chip" onClick={onToggle}>
          {managementOpen ? t('controls.closeManagement') : t('controls.management')}
        </button>
      </div>

      {managementOpen ? (
        <div className="management-grid">
          <Section
            title={t('sections.dispatch')}
            subtitle={t('app.description')}
            actions={(
              <button className="button accent" onClick={enqueueTask}>
                {t('controls.addTask')}
              </button>
            )}
            className="management-section"
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
          </Section>

          <Section
            title={t('sections.workspaceEditor')}
            subtitle={`${t('labels.activeWorkspace')}: ${board.activeWorkspace?.name ?? t('misc.empty')}`}
            actions={(
              <>
                <button className="button ghost" onClick={onBrowseWorkspace}>
                  {t('controls.browse')}
                </button>
                <button className="button ghost" onClick={createWorkspaceFromFolder}>
                  {t('controls.importWorkspace')}
                </button>
              </>
            )}
            className="management-section"
          >
            <div className="workspace-dashboard management-workspace">
              <div className="workspace-editors">
                <div className="workspace-card workspace-editor">
                  <span>{t('sections.workspaceEditor')}</span>
                  <strong>{board.activeWorkspace?.name ?? t('misc.empty')}</strong>
                  <p>{board.activeWorkspace?.description || t('misc.empty')}</p>
                  <div className="form-grid settings-grid">
                    <label>
                      <span>{t('labels.name')}</span>
                      <input
                        value={board.activeWorkspace?.name || ''}
                        onChange={(event) => board.activeWorkspace && api?.updateWorkspace(board.activeWorkspace.id, { name: event.target.value })}
                        placeholder={t('labels.name')}
                      />
                    </label>

                    <label className="span-2">
                      <span>{t('labels.description')}</span>
                      <textarea
                        value={board.activeWorkspace?.description || ''}
                        onChange={(event) => board.activeWorkspace && api?.updateWorkspace(board.activeWorkspace.id, { description: event.target.value })}
                        placeholder={t('labels.description')}
                        rows={3}
                      />
                    </label>

                    <label className="span-2">
                      <span>{t('labels.path')}</span>
                      <input
                        value={board.activeWorkspace?.path || ''}
                        onChange={(event) => board.activeWorkspace && api?.updateWorkspace(board.activeWorkspace.id, { path: event.target.value })}
                        placeholder="/Users/you/project"
                      />
                    </label>

                    <label>
                      <span>{t('labels.leadAI')}</span>
                      <select
                        value={board.activeWorkspace?.leadAgentId || board.leadAgent?.id || ''}
                        onChange={(event) => board.activeWorkspace && api?.updateWorkspace(board.activeWorkspace.id, { leadAgentId: event.target.value })}
                      >
                        {board.agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>{t('labels.providerMode')}</span>
                      <select
                        value={board.activeWorkspace?.providerMode || 'scripted'}
                        onChange={(event) => board.activeWorkspace && api?.updateWorkspace(board.activeWorkspace.id, { providerMode: event.target.value })}
                      >
                        <option value="scripted">{t('labels.scripted')}</option>
                        <option value="command">{t('labels.command')}</option>
                      </select>
                    </label>

                    <label className="span-2">
                      <span>{t('labels.providerCommand')}</span>
                      <input
                        value={board.activeWorkspace?.providerCommand || ''}
                        onChange={(event) => board.activeWorkspace && api?.updateWorkspace(board.activeWorkspace.id, { providerCommand: event.target.value })}
                        placeholder="node ./scripts/codex-provider.mjs"
                      />
                    </label>

                    <label>
                      <span>{t('labels.providerTimeout')}</span>
                      <input
                        type="number"
                        min="1000"
                        value={board.activeWorkspace?.providerTimeoutMs ?? snapshot.settings.providerTimeoutMs}
                        onChange={(event) => board.activeWorkspace && api?.updateWorkspace(board.activeWorkspace.id, { providerTimeoutMs: Number(event.target.value) })}
                      />
                    </label>

                    <label>
                      <span>{t('labels.runnerMode')}</span>
                      <select
                        value={board.activeWorkspace?.runnerMode || 'simulated'}
                        onChange={(event) => board.activeWorkspace && api?.updateWorkspace(board.activeWorkspace.id, { runnerMode: event.target.value })}
                      >
                        <option value="simulated">{t('labels.simulated')}</option>
                        <option value="shell">{t('labels.shell')}</option>
                      </select>
                    </label>

                    <label className="span-2">
                      <span>{t('labels.runnerCommand')}</span>
                      <input
                        value={board.activeWorkspace?.runnerCommand || ''}
                        onChange={(event) => board.activeWorkspace && api?.updateWorkspace(board.activeWorkspace.id, { runnerCommand: event.target.value })}
                        placeholder="pnpm test"
                      />
                    </label>

                    <label>
                      <span>{t('labels.runnerTimeout')}</span>
                      <input
                        type="number"
                        min="1000"
                        value={board.activeWorkspace?.runnerTimeoutMs ?? snapshot.settings.runnerTimeoutMs}
                        onChange={(event) => board.activeWorkspace && api?.updateWorkspace(board.activeWorkspace.id, { runnerTimeoutMs: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                </div>

                <div className="workspace-card template-editor">
                  <span>{t('sections.templateEditor')}</span>
                  <strong>{board.activeTemplate?.title ?? t('labels.workspaceTemplate')}</strong>
                  <p>{board.activeTemplate?.description || t('misc.empty')}</p>
                  <div className="form-grid settings-grid">
                    <label>
                      <span>{t('labels.title')}</span>
                      <input
                        value={board.activeTemplate?.title || ''}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { title: event.target.value })}
                        placeholder={t('labels.title')}
                      />
                    </label>

                    <label className="span-2">
                      <span>{t('labels.objective')}</span>
                      <textarea
                        value={board.activeTemplate?.objective || ''}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { objective: event.target.value })}
                        placeholder={t('labels.objective')}
                        rows={4}
                      />
                    </label>

                    <label className="span-2">
                      <span>{t('labels.description')}</span>
                      <textarea
                        value={board.activeTemplate?.description || ''}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { description: event.target.value })}
                        placeholder={t('labels.description')}
                        rows={3}
                      />
                    </label>

                    <label>
                      <span>{t('labels.ownerAI')}</span>
                      <select
                        value={board.activeTemplate?.ownerAgentId || board.leadAgent?.id || ''}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { ownerAgentId: event.target.value })}
                      >
                        {board.agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>{t('labels.department')}</span>
                      <select
                        value={board.activeTemplate?.departmentId || 'command'}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { departmentId: event.target.value })}
                      >
                        {board.departments.map((department) => (
                          <option key={department.id} value={department.id}>
                            {department.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label>
                      <span>{t('labels.scope')}</span>
                      <select
                        value={board.activeTemplate?.scope || 'workspace'}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { scope: event.target.value })}
                      >
                        <option value="workspace">{t('labels.workspaceScope')}</option>
                        <option value="orchestrator">{t('labels.orchestratorScope')}</option>
                      </select>
                    </label>

                    <label>
                      <span>{t('labels.kind')}</span>
                      <input
                        value={board.activeTemplate?.kind || ''}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { kind: event.target.value })}
                        placeholder={t('labels.kind')}
                      />
                    </label>

                    <label>
                      <span>{t('labels.priority')}</span>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        value={board.activeTemplate?.priority ?? 3}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { priority: Number(event.target.value) })}
                      />
                    </label>

                    <label>
                      <span>{t('labels.providerMode')}</span>
                      <select
                        value={board.activeTemplate?.providerMode || 'scripted'}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { providerMode: event.target.value })}
                      >
                        <option value="scripted">{t('labels.scripted')}</option>
                        <option value="command">{t('labels.command')}</option>
                      </select>
                    </label>

                    <label className="span-2">
                      <span>{t('labels.providerCommand')}</span>
                      <input
                        value={board.activeTemplate?.providerCommand || ''}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { providerCommand: event.target.value })}
                        placeholder="node ./scripts/codex-provider.mjs"
                      />
                    </label>

                    <label>
                      <span>{t('labels.providerTimeout')}</span>
                      <input
                        type="number"
                        min="1000"
                        value={board.activeTemplate?.providerTimeoutMs ?? snapshot.settings.providerTimeoutMs}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { providerTimeoutMs: Number(event.target.value) })}
                      />
                    </label>

                    <label>
                      <span>{t('labels.runnerMode')}</span>
                      <select
                        value={board.activeTemplate?.runnerMode || 'simulated'}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { runnerMode: event.target.value })}
                      >
                        <option value="simulated">{t('labels.simulated')}</option>
                        <option value="shell">{t('labels.shell')}</option>
                      </select>
                    </label>

                    <label className="span-2">
                      <span>{t('labels.runnerCommand')}</span>
                      <input
                        value={board.activeTemplate?.runnerCommand || ''}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { runnerCommand: event.target.value })}
                        placeholder="pnpm test"
                      />
                    </label>

                    <label>
                      <span>{t('labels.runnerTimeout')}</span>
                      <input
                        type="number"
                        min="1000"
                        value={board.activeTemplate?.runnerTimeoutMs ?? snapshot.settings.runnerTimeoutMs}
                        onChange={(event) => board.activeTemplate && api?.updateWorkspaceTemplate(board.activeTemplate.id, { runnerTimeoutMs: Number(event.target.value) })}
                      />
                    </label>
                  </div>

                  <div className="inline-actions">
                    <button className="button accent" onClick={() => api?.seedWorkspaceTask(board.activeTemplate?.id ?? null)}>
                      {t('controls.seedCurrentTemplate')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          <Section
            title={t('sections.runtime')}
            subtitle={snapshot.settings.paused ? t('labels.pausedState') : t('misc.connected')}
            className="management-section"
          >
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
        </div>
      ) : null}
    </section>
  );
}

export function OperatorApp({ api }) {
  const [snapshot] = useOperatorSnapshot(api);
  const [selectedMissionId, setSelectedMissionId] = useState(null);
  const [managementOpen, setManagementOpen] = useState(false);
  const [draft, setDraft] = useState({
    title: '',
    objective: '',
    scope: 'workspace',
    priority: 3,
  });

  const locale = snapshot?.settings?.locale ?? 'en';
  const t = createTranslator(locale);
  const board = useMemo(() => buildCompanyBoard(snapshot ?? {}), [snapshot]);

  useEffect(() => {
    if (!board.missions.length) {
      setSelectedMissionId(null);
      return;
    }

    setSelectedMissionId((current) => {
      if (current && board.missions.some((mission) => mission.id === current)) {
        return current;
      }
      return board.activeMission?.id ?? board.missions[0].id;
    });
  }, [board.activeMission?.id, board.missions]);

  const selectedMission = board.missions.find((mission) => mission.id === selectedMissionId)
    ?? board.activeMission
    ?? board.missions[0]
    ?? null;

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

  async function updateSettings(patch) {
    if (!api) return;
    await api.updateSettings(patch);
  }

  async function seedDemo() {
    if (!api) return;
    await api.seedDemoTasks();
  }

  async function runCurrent() {
    if (!api) return;
    await api.runOnce();
  }

  async function togglePause() {
    if (!api) return;
    await (snapshot.settings.paused ? api.resume() : api.pause());
  }

  return (
    <div className="shell command-shell">
      <div className="ambient ambient-a" />
      <div className="ambient ambient-b" />

      <header className="command-hero">
        <div className="hero-copy">
          <p className="eyebrow">{t('nav.overview')}</p>
          <h1>{t('app.title')}</h1>
          <p className="subtitle">{t('app.subtitle')}</p>
          <p className="description">{t('app.description')}</p>
          <div className="hero-goal">
            <span>{t('labels.currentGoal')}</span>
            <strong>{board.currentGoal || t('misc.empty')}</strong>
            <small>
              {board.activeWorkspace?.name ?? t('misc.empty')} · {board.leadAgent?.name ?? t('misc.empty')}
            </small>
          </div>
        </div>

        <div className="hero-panel">
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

          <div className="hero-controls">
            <button className="chip action" onClick={togglePause}>
              {snapshot.settings.paused ? t('controls.resume') : t('controls.pause')}
            </button>
            <button className="chip" onClick={() => api?.toggleAutoLoop()}>
              {t('controls.autoLoop')}: {snapshot.settings.autoLoop ? t('misc.on') : t('misc.off')}
            </button>
            <button className="chip" onClick={runCurrent}>
              {t('controls.runNow')}
            </button>
            <button className="chip" onClick={() => setManagementOpen((value) => !value)}>
              {managementOpen ? t('controls.closeManagement') : t('controls.management')}
            </button>
            <button className="chip action" onClick={seedDemo}>
              {t('controls.seedDemo')}
            </button>
          </div>

          <div className="hero-brief">
            <span>{t('labels.leadAI')}</span>
            <strong>
              {board.leadAgent?.name ?? t('misc.empty')} · {board.leadAgent?.title ?? t('misc.empty')}
            </strong>
            <p>{board.activeMission?.thinking.nextAction || t('misc.idle')}</p>
            <div className="hero-brief-meta">
              <span>{board.activeWorkspace?.name ?? t('misc.empty')}</span>
              <span>{board.activeMission ? t(`status.${board.activeMission.status}`) ?? board.activeMission.status : t('misc.idle')}</span>
            </div>
          </div>
        </div>
      </header>

      <section className="board-stats">
        <MetricTile label={t('labels.queueDepth')} value={board.metrics.queueDepth} hint={snapshot.settings.paused ? t('labels.pausedState') : t('misc.connected')} />
        <MetricTile label={t('labels.activeTask')} value={board.metrics.activeCount} hint={board.activeMission ? board.activeMission.title : t('misc.idle')} />
        <MetricTile label={t('labels.completed')} value={board.metrics.completedCount} hint={t('misc.enabled')} />
        <MetricTile label={t('labels.blocked')} value={board.metrics.blockedCount} hint={t('misc.blockedByPolicy')} />
        <MetricTile label={t('labels.waitingApproval')} value={board.metrics.pendingApprovals} hint={t('misc.pending')} />
      </section>

      <main className="command-grid">
        <div className="board-column">
          <Section
            title={t('sections.staff')}
            subtitle={`${board.metrics.staffCount} ${t('labels.jobs') || 'roles'}`}
          >
            <div className="agent-roster">
              {board.agents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  t={t}
                  selected={agent.id === board.leadAgent?.id}
                />
              ))}
            </div>
          </Section>

          <Section
            title={t('sections.departments')}
            subtitle={t('labels.departmentOverview') || 'Department workload and ownership'}
          >
            <div className="department-list">
              {board.departments.map((department) => (
                <DepartmentCard key={department.id} department={department} t={t} />
              ))}
            </div>
          </Section>
        </div>

        <div className="board-column">
          <Section
            title={t('sections.commandBoard')}
            subtitle={board.currentGoal || t('misc.empty')}
            actions={(
              <button className="button ghost" onClick={() => api?.seedWorkspaceTask(board.activeTemplate?.id ?? null)}>
                {t('controls.seedCurrentTemplate')}
              </button>
            )}
            className="mission-board-section"
          >
            <PipelineTrack
              pipelineStages={board.pipelineStages}
              selectedMissionId={selectedMission?.id}
              onSelectMission={setSelectedMissionId}
              t={t}
            />

            <MissionDetail
              key={`${selectedMission?.id ?? 'none'}-${selectedMission?.status ?? 'none'}-${selectedMission?.updatedAt ?? 'none'}`}
              mission={selectedMission}
              pipelineStages={board.pipelineStages}
              t={t}
              locale={locale}
            />

            <div className="pipeline-lanes">
              {board.pipelineStages.map((stage) => (
                <PipelineLane
                  key={stage.id}
                  stage={stage}
                  t={t}
                  selectedMissionId={selectedMission?.id}
                  onSelectMission={setSelectedMissionId}
                />
              ))}
            </div>
          </Section>

          <Section
            title={t('sections.completedMissions')}
            subtitle={`${board.archive.length} ${t('labels.completed')}`}
          >
            <div className="archive-list">
              {board.archive.length === 0 ? (
                <p className="empty-state">{t('labels.noTasks')}</p>
              ) : (
                board.archive.map((mission) => (
                  <ArchiveItem
                    key={mission.id}
                    mission={mission}
                    t={t}
                    locale={locale}
                    onSelect={setSelectedMissionId}
                  />
                ))
              )}
            </div>
          </Section>
        </div>

        <div className="board-column">
          <Section
            title={t('sections.reviewDesk')}
            subtitle={`${t('labels.waitingApproval')}: ${board.metrics.pendingApprovals}`}
          >
            <div className="review-desk">
              <div className="thinking-block">
                <span>{t('labels.thinking')}</span>
                {selectedMission ? (
                  <dl>
                    <div>
                      <dt>{t('labels.currentGoal')}</dt>
                      <dd>{selectedMission.thinking.goal}</dd>
                    </div>
                    <div>
                      <dt>{t('labels.rationale')}</dt>
                      <dd>{selectedMission.thinking.rationale}</dd>
                    </div>
                    <div>
                      <dt>{t('labels.blocker')}</dt>
                      <dd>{selectedMission.thinking.blocker || t('misc.empty')}</dd>
                    </div>
                    <div>
                      <dt>{t('labels.nextAction')}</dt>
                      <dd>{selectedMission.thinking.nextAction}</dd>
                    </div>
                  </dl>
                ) : (
                  <p className="empty-state">{t('labels.noTasks')}</p>
                )}
              </div>

              <div className="approval-list">
                {board.approvals.length === 0 ? (
                  <p className="empty-state">{t('labels.noApprovals')}</p>
                ) : (
                  board.approvals.map((approval) => {
                    const task = board.missionIndex.get(approval.taskId);
                    return (
                      <ApprovalItem
                        key={approval.id}
                        approval={approval}
                        task={task}
                        t={t}
                        onApprove={() => api?.approveTask({ taskId: approval.taskId, approvalId: approval.id })}
                        onReject={() => api?.rejectTask({ taskId: approval.taskId, approvalId: approval.id })}
                      />
                    );
                  })
                )}
              </div>

              <div className="blocker-list">
                {board.blockers.length === 0 ? (
                  <p className="empty-state">{t('misc.blockedByPolicy')}</p>
                ) : (
                  board.blockers.map((mission) => (
                    <article key={mission.id} className="blocker-card">
                      <div className="blocker-head">
                        <strong>{mission.title}</strong>
                        <span className={statusClass(mission.status)}>{t(`status.${mission.status}`) ?? mission.status}</span>
                      </div>
                      <p>{mission.thinking.blocker || mission.review?.notes || t('misc.blockedByPolicy')}</p>
                    </article>
                  ))
                )}
              </div>
            </div>
          </Section>

          <Section
            title={t('sections.activityFeed')}
            subtitle={formatDateTime(locale, snapshot.system.lastTickAt)}
          >
            <ul className="log-list">
              {board.logs.length === 0 ? (
                <p className="empty-state">{t('labels.noLogs')}</p>
              ) : (
                board.logs.slice(0, 80).map((entry) => <LogLine key={entry.id} entry={entry} locale={locale} />)
              )}
            </ul>
          </Section>
        </div>
      </main>

      <ManagementPanel
        board={board}
        snapshot={snapshot}
        draft={draft}
        setDraft={setDraft}
        api={api}
        t={t}
        managementOpen={managementOpen}
        onToggle={() => setManagementOpen((value) => !value)}
      />
    </div>
  );
}

export default function App() {
  const api = typeof window !== 'undefined' ? window.operator : null;
  return <OperatorApp api={api} />;
}

export { useOperatorSnapshot };
