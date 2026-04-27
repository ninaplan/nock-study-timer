'use client';
import {
  Type,
  AlignLeft,
  Hash,
  Calendar,
  CheckSquare,
  List,
  ListOrdered,
  Link2,
  Sigma,
  Layers,
  User,
  Paperclip,
  Link,
  Mail,
  Phone,
  Circle,
} from 'lucide-react';

const SZ = 18;
const S = 1.75;

const MAP = {
  title: Type,
  rich_text: AlignLeft,
  number: Hash,
  date: Calendar,
  checkbox: CheckSquare,
  status: ListOrdered,
  select: List,
  multi_select: List,
  relation: Link2,
  formula: Sigma,
  rollup: Layers,
  people: User,
  files: Paperclip,
  url: Link,
  email: Mail,
  phone_number: Phone,
};

/**
 * Notion “속성 유형” 느낌의 Lucide 아이콘 (UI 유사, 공식과 1:1은 아님)
 */
export default function NotionPropertyTypeIcon({ type, size = SZ, className, style, color = 'var(--text3)' }) {
  const C = (type && MAP[type]) || Circle;
  return <C size={size} strokeWidth={S} className={className} style={{ flexShrink: 0, color, ...style }} aria-hidden />;
}
