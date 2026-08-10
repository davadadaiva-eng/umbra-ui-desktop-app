export type BrainNoteKind = 'note' | 'attachment' | 'tag' | 'agent';

export interface BrainNote {
  id: string;
  name: string;
  folder: string;
  tags: string[];
  links: string[];
  content: string;
  kind: BrainNoteKind;
}

export const files: { id: string; name: string; type: string; size: string; date: string }[] = [];

export const brainNotes: BrainNote[] = [
  { id: 'journal-index', name: 'Journal', folder: 'Journal', tags: ['journal', 'system'], links: [], content: 'Everything said and done is written here, in order. Every sentence you type, every word I speak, every action taken.', kind: 'note' },
];

export const attachmentNotes: BrainNote[] = [];
