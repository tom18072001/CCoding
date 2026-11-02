// Pure helpers for task directories, so the runner and its tests share one definition.
import fs from 'node:fs';
import path from 'node:path';

/** Where a task's starting repo and (optional) oracle solution live. Defaults keep the original layout (`repo/`). */
export function taskDirs(suite, task) {
  const root = path.join(suite, 'tasks', task.id);
  return {
    root,
    hiddenDir: path.join(root, 'hidden'),
    repoDir: path.join(root, task.repoDir ?? 'repo'),
    solutionDir: task.solutionDir ? path.join(root, task.solutionDir) : undefined,
  };
}

/** Empty `dir`, then copy the task's repo into it. A task without a repo directory (git does not keep empty dirs) starts empty. */
export function populateWorkspace(dir, repoDir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(repoDir)) fs.cpSync(repoDir, dir, { recursive: true });
  return dir;
}
