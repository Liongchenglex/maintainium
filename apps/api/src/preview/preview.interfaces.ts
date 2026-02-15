export interface PreviewChangePayload {
  changeId: string;
  projectId: string;
}

export interface DiffBlock {
  filePath: string;
  language: string;
  hunks: DiffHunk[];
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
}
