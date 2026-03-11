import React, { useState, useEffect } from 'react';
import { Item, BoardColumn, ColumnValue } from '../../types';
import { socket } from '../../store/socket';
import { Mail, ExternalLink } from 'lucide-react';

interface ContactValue {
  text?: string;
  link?: string;
}

function parseContactValue(value: string | undefined): ContactValue {
  if (!value?.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return { text: parsed.text ?? '', link: parsed.link ?? '' };
  } catch {
    return { text: value, link: '' };
  }
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function isPhone(s: string): boolean {
  return /^[\d\s+()-]{8,}$/.test(s.trim().replace(/\s/g, ''));
}

function whatsappUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const withCountry = digits.length <= 10 ? '52' + digits : digits;
  return `https://wa.me/${withCountry}`;
}

interface Props {
  item: Item;
  column: BoardColumn;
  value?: ColumnValue;
}

export const ContactCellRenderer: React.FC<Props> = ({ item, column, value }) => {
  const [editing, setEditing] = useState(false);
  const parsed = parseContactValue(value?.value);
  const [text, setText] = useState(parsed.text ?? '');
  const [link, setLink] = useState(parsed.link ?? '');

  useEffect(() => {
    if (editing) {
      setText(parsed.text ?? '');
      setLink(parsed.link ?? '');
    }
  }, [editing, parsed.text, parsed.link]);

  const save = () => {
    setEditing(false);
    const payload = JSON.stringify({ text: text.trim(), link: link.trim() || undefined });
    socket.emit('update_column_value', { itemId: item.id, columnId: column.id, value: payload });
  };
  const emailCandidate = isEmail(parsed.text || '') ? parsed.text : isEmail(parsed.link || '') ? parsed.link : '';
  const phoneCandidate = isPhone(parsed.text || '') ? parsed.text : isPhone(parsed.link || '') ? parsed.link : '';
  const displayText =
    emailCandidate && phoneCandidate
      ? `${emailCandidate} · ${phoneCandidate}`
      : parsed.text?.trim() || parsed.link?.trim() || '—';
  const hasLink = !!parsed.link?.trim();
  const openLink = () => {
    let url = parsed.link!.trim();
    if (!url.startsWith('http')) url = 'https://' + url;
    window.open(url, '_blank', 'noopener');
  };
  const openWhatsApp = () => {
    const phone = phoneCandidate || parsed.text || parsed.link || '';
    const url = whatsappUrl(phone);
    window.open(url, '_blank', 'noopener');
  };

  if (editing) {
    return (
      <div className="w-full h-full min-h-[38px] flex items-center gap-1 px-2" onClick={e => e.stopPropagation()}>
        <input
          type="text"
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Correo o teléfono"
          className="flex-1 min-w-0 text-[12px] border border-monday-blue rounded px-1.5 py-0.5 outline-none"
        />
        <input
          type="text"
          value={link}
          onChange={e => setLink(e.target.value)}
          placeholder="Enlace (ej. WhatsApp)"
          className="flex-1 min-w-0 text-[12px] border border-monday-border rounded px-1.5 py-0.5 outline-none"
        />
        <button type="button" onClick={save} className="text-[11px] text-monday-blue font-medium shrink-0">Guardar</button>
      </div>
    );
  }

  return (
    <div
      className="w-full h-full min-h-[38px] flex items-center gap-1.5 px-2 cursor-pointer hover:bg-monday-hover transition-colors"
      onClick={e => { e.stopPropagation(); setEditing(true); }}
    >
      <Mail size={14} className="text-monday-subtext shrink-0" />
      <span className="text-[13px] text-monday-text truncate flex-1 min-w-0">{displayText}</span>
      {hasLink && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); openLink(); }}
          className="shrink-0 p-0.5 rounded text-monday-blue hover:bg-monday-hover"
          title="Abrir enlace"
        >
          <ExternalLink size={12} />
        </button>
      )}
      {!hasLink && parsed.text?.trim() && isPhone(parsed.text) && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); openWhatsApp(); }}
          className="shrink-0 text-[11px] text-green-600 hover:underline"
          title="Abrir WhatsApp"
        >
          WhatsApp
        </button>
      )}
    </div>
  );
};
