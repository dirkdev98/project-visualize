import type { Entry } from "./store.ts";

export interface LibraryArtifact {
  artifact: string;
  entry: Entry;
  updated: number;
}
export interface LibraryProject {
  project: string;
  updated: number;
  artifacts: LibraryArtifact[];
}

// Each artifact shows its presented revision, or its latest one when nothing is
// presented. Presenting an older revision counts as activity, so an artifact an agent
// just showed again moves to the top with the ones it just rendered.
export function libraryGroups(entries: Entry[]): LibraryProject[] {
  const projects = new Map<string, Map<string, LibraryArtifact>>();
  for (const entry of entries) {
    let artifacts = projects.get(entry.project);
    if (!artifacts) {
      artifacts = new Map();
      projects.set(entry.project, artifacts);
    }
    const updated = Math.max(
      Date.parse(entry.createdAt),
      entry.presentedAt ? Date.parse(entry.presentedAt) : 0,
    );
    const known = artifacts.get(entry.artifact);
    if (!known) {
      artifacts.set(entry.artifact, {
        artifact: entry.artifact,
        entry,
        updated,
      });
      continue;
    }
    known.updated = Math.max(known.updated, updated);
    if (
      entry.currentPresentation ||
      (!known.entry.currentPresentation && entry.version > known.entry.version)
    )
      known.entry = entry;
  }
  const recent = (a: { updated: number }, b: { updated: number }) =>
    b.updated - a.updated;
  return [...projects]
    .map(([project, artifacts]) => {
      const sorted = [...artifacts.values()].sort(
        (a, b) => recent(a, b) || a.artifact.localeCompare(b.artifact),
      );
      return { project, updated: sorted[0].updated, artifacts: sorted };
    })
    .sort((a, b) => recent(a, b) || a.project.localeCompare(b.project));
}

export function archiveNeighbor(
  entries: Entry[],
  current: Pick<Entry, "project" | "artifact">,
): Entry | undefined {
  const artifacts = libraryGroups(entries)
    .find(({ project }) => project === current.project)
    ?.artifacts.filter(
      ({ artifact, entry }) =>
        artifact === current.artifact || !entry.archivedAt,
    );
  if (!artifacts) return undefined;
  const index = artifacts.findIndex(
    ({ artifact }) => artifact === current.artifact,
  );
  if (index < 0) return undefined;
  return (artifacts[index - 1] ?? artifacts[index + 1])?.entry;
}
