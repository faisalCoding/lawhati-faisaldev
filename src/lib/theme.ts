export const colors = {
  text: '#172B4D',
  textSubtle: '#44546F',
  textFaint: '#626F86',
  page: '#F7F8F9',
  surface: '#FFFFFF',
  list: '#F1F2F4',
  border: '#DCDFE4',
  input: '#FFFFFF',
  primary: '#0C66E4',
  primaryPressed: '#0055CC',
  onPrimary: '#FFFFFF',
  neutralBtn: 'rgba(9,30,66,0.06)',
  neutralBtnPressed: 'rgba(9,30,66,0.14)',
  danger: '#C9372C',
  dangerBg: '#FFECEB',
  success: '#216E4E',
  successBg: '#DCFFF1',
  warning: '#7F5F01',
  warningBg: '#FFF7D6',
  placeholder: 'rgba(9,30,66,0.10)',
  placeholderOver: 'rgba(201,55,44,0.16)',
  backdrop: 'rgba(9,30,66,0.48)',
  online: '#22A06B',
  offline: '#8590A2',
} as const;

export const BOARD_COLORS = ['#0C66E4', '#1F845A', '#C25100', '#AE2E24', '#6E5DC6', '#AE4787', '#206A83', '#44546F'];

export const LABEL_COLORS = {
  green: '#4BCE97',
  yellow: '#F5CD47',
  orange: '#FEA362',
  red: '#F87168',
  purple: '#9F8FEF',
  blue: '#579DFF',
} as const;

export const COVER_COLORS = ['#4BCE97', '#F5CD47', '#FEA362', '#F87168', '#9F8FEF', '#579DFF', '#6CC3E0', '#E774BB'];

/**
 * The backgrounds a column can wear. Soft on purpose: the cards on a column stay white and its
 * title stays dark, so every one of these has to keep both readable — a saturated column would
 * drown its own cards.
 */
export const COLUMN_COLORS = [
  { value: '#BAF3DB', name: 'أخضر' },
  { value: '#F8E6A0', name: 'أصفر' },
  { value: '#FEDEC8', name: 'برتقالي' },
  { value: '#FFD5D2', name: 'أحمر' },
  { value: '#DFD8FD', name: 'بنفسجي' },
  { value: '#CCE0FF', name: 'أزرق' },
  { value: '#C6EDFB', name: 'سماوي' },
  { value: '#FDD0EC', name: 'وردي' },
] as const;

export const LIST_WIDTH = 272;
export const LIST_GAP = 10;
