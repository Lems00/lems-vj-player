// Accès typé aux 26 composants du design system « Lems VJ Player ».
// Le design system est livré tel quel (lems.js, lems.css) : on ne le modifie pas
// ici, on le consomme. Voir docs/plan.md, décision 4.
import './react-global';
import './tokens.css';
import './lems.css';
import './lems.js';
import type { ComponentType, ReactNode } from 'react';

export type DeckId = 'a' | 'b' | 'c' | 'd';
export const DECKS: DeckId[] = ['a', 'b', 'c', 'd'];

export interface StripValue { gain: number; hi: number; mid: number; lo: number; volume: number; prelisten: boolean }
export interface SearchResult { id: string; title: string; channel?: string; duration?: number | string; thumbnail?: string }
export interface SelectOption { value: string; label: string; meta?: string; disabled?: boolean }
export interface TableColumn { key: string; label: string; mono?: boolean; align?: 'right'; sortable?: boolean; render?: (row: Record<string, unknown>) => ReactNode }

// Les composants sont écrits en JavaScript : on les type par leurs props utiles.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProps = Record<string, any>;

export interface LemsApi {
  Deck: ComponentType<AnyProps & { deck: DeckId; title?: string; artist?: string; duration?: number; bpm?: number | null; keyName?: string | null; pitch?: number | null; position?: number; cuePoint?: number | null; playing?: boolean; onPlayingChange?: (p: boolean) => void; onCue?: () => void; onSeek?: (s: number) => void; prelisten?: boolean; onAir?: boolean; source?: 'youtube' | 'file'; peaks?: number[] }>;
  Waveform: ComponentType<AnyProps>;
  TransportButton: ComponentType<AnyProps>;
  ChannelStrip: ComponentType<AnyProps & { deck: DeckId; value: StripValue; onChange: (v: StripValue) => void; level?: number; peak?: number; faderHeight?: number; source?: 'youtube' | 'file' }>;
  Knob: ComponentType<AnyProps & { label?: string; value?: number; defaultValue?: number; onChange?: (v: number) => void; bipolar?: boolean; size?: number; disabled?: boolean; min?: number; max?: number; format?: (v: number) => string }>;
  Fader: ComponentType<AnyProps>;
  VuMeter: ComponentType<AnyProps & { level: number; height?: number; peak?: number }>;
  Crossfader: ComponentType<AnyProps & { left: DeckId; right: DeckId; value: number; onChange: (v: number) => void }>;
  VideoMonitor: ComponentType<AnyProps & { mode: 'preview' | 'program'; deck?: DeckId; title?: string; live?: boolean; prelisten?: boolean; children?: ReactNode; emptyText?: string }>;
  TrackSearch: ComponentType<AnyProps & { query: string; onQueryChange: (q: string) => void; onSearch: (q: string) => void; loading?: boolean; results: SearchResult[]; loaded?: Partial<Record<DeckId, string>>; onLoad: (r: SearchResult, d: DeckId) => void; onPreview?: (r: SearchResult) => void; emptyText?: string; placeholder?: string }>;
  DeckLetter: ComponentType<AnyProps & { deck: DeckId; size?: 'sm'; outline?: boolean }>;
  Badge: ComponentType<AnyProps & { tone: 'on-air' | 'cue' | 'neutral'; children?: ReactNode }>;
  Button: ComponentType<AnyProps & { variant?: 'solid' | 'ghost' | 'outline'; size?: 'sm'; onClick?: () => void; disabled?: boolean; type?: 'button' | 'submit'; children?: ReactNode }>;
  Icon: ComponentType<AnyProps & { name: string; size?: number }>;
  AppBar: ComponentType<AnyProps & { title?: string; items?: string[]; active: string; onNavigate: (item: string) => void; devices?: number; status?: ReactNode }>;
  Select: ComponentType<AnyProps & { value?: string; defaultValue?: string; onChange?: (v: string) => void; options: SelectOption[]; placeholder?: string; disabled?: boolean; 'aria-label'?: string }>;
  TextField: ComponentType<AnyProps & { label?: string; value?: string; onChange?: (v: string) => void; placeholder?: string; error?: string; type?: string; icon?: string }>;
  CodeInput: ComponentType<AnyProps>;
  Toggle: ComponentType<AnyProps & { checked?: boolean; onChange?: (v: boolean) => void; label?: string; hint?: string; disabled?: boolean }>;
  SegmentedControl: ComponentType<AnyProps & { value: string; onChange: (v: string) => void; options: SelectOption[]; reason?: string; disabled?: boolean }>;
  Notice: ComponentType<AnyProps & { title?: string; children?: ReactNode }>;
  PairingCode: ComponentType<AnyProps & { code: string; expiresIn?: number; note?: string; qr?: ReactNode; onRenew?: () => void }>;
  Dialog: ComponentType<AnyProps & { open?: boolean; title: string; onClose?: () => void; actions?: ReactNode; children?: ReactNode; contained?: boolean }>;
  Table: ComponentType<AnyProps & { columns: TableColumn[]; rows: Record<string, unknown>[]; rowKey?: (row: Record<string, unknown>, i: number) => string; selectedKey?: string; onRowClick?: (row: Record<string, unknown>, key: string) => void }>;
  DeviceRow: ComponentType<AnyProps & { name: string; state?: 'connected' | 'pending' | 'offline' | 'unstable'; detail?: string; role?: string; onRoleChange?: (r: string) => void; actions?: ReactNode }>;
  StatusDot: ComponentType<AnyProps & { state: 'connected' | 'pending' | 'offline' | 'unstable'; label?: string }>;
  formatTime: (sec: number | null | undefined, tenths?: boolean) => string;
  makePeaks: (seed: string, n?: number) => number[];
}

const api = (window as unknown as { LemsMP?: LemsApi }).LemsMP;
if (!api) throw new Error('Le design system Lems VJ Player (lems.js) ne s’est pas chargé.');

export const L: LemsApi = api;
