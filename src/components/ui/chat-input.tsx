// --- Demo ---
import { type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { BorderBeam } from './border-beam';

function AtSignIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M10.4 5.59963V8.59962C10.4 9.07701 10.5896 9.53485 10.9272 9.87242C11.2648 10.21 11.7226 10.3996 12.2 10.3996C12.6774 10.3996 13.1352 10.21 13.4728 9.87242C13.8104 9.53485 14 9.07701 14 8.59962V7.99962C13.9999 6.64544 13.5417 5.33111 12.7 4.27035C11.8582 3.20958 10.6823 2.46476 9.36359 2.15701C8.04484 1.84925 6.66076 1.99665 5.43641 2.57525C4.21206 3.15384 3.21944 4.1296 2.61996 5.34386C2.02048 6.55812 1.84939 7.93947 2.13451 9.26329C2.41963 10.5871 3.14419 11.7756 4.19038 12.6354C5.23657 13.4952 6.54286 13.9758 7.89684 13.9991C9.25083 14.0224 10.5729 13.587 11.648 12.7636M10.4 7.99962C10.4 9.32511 9.32549 10.3996 8 10.3996C6.67452 10.3996 5.6 9.32511 5.6 7.99962C5.6 6.67414 6.67452 5.59963 8 5.59963C9.32549 5.59963 10.4 6.67414 10.4 7.99962Z"
        stroke="#808388"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: "rotate(90deg)" }}>
      <path d="M7 11L10 8L7 5" stroke="#8B9099" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
    </svg>
  );
}

function ArrowUpIcon({ color = "#8B8B8B" }: { color?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 12.6667V3.33333M12.6667 8L8 3.33333L3.33333 8" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const CHIP: React.CSSProperties = {
  borderRadius: 36,
  background: "rgba(255,255,255,0.04)",
  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.02), inset 0 1px 0 0 rgba(255,255,255,0.04)",
};

export { CHIP };

export interface ChatInputChip {
  label?: ReactNode;
  onClick?: () => void;
  title?: string;
  /** Accent-tinted when active (used by the Auto chip). */
  active?: boolean;
}

export interface ChatInputProps {
  value?: string;
  onValueChange?: (value: string) => void;
  onEnter?: () => void;
  onEscape?: () => void;
  onSend?: () => void;
  placeholder?: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** Content for the @ chip (defaults to the AtSign icon). */
  mention?: ReactNode;
  onMention?: () => void;
  agent?: ChatInputChip;
  auto?: ChatInputChip;
  /** Extra chips rendered before the send button. */
  extraChips?: ReactNode;
  /** Arrow color when there is text. */
  sendColor?: string;
}

function ChatInput({
  value,
  onValueChange,
  onEnter,
  onEscape,
  onSend,
  placeholder,
  inputRef,
  mention,
  onMention,
  agent,
  auto,
  extraChips,
  sendColor,
}: ChatInputProps) {
  const controlled = typeof value === 'string';
  const hasText = controlled && value.trim().length > 0;

  return (
    <div
      style={{
        width: 348,
        maxWidth: "100%",
        borderRadius: 20,
        background: "#1d1d1d",
        boxShadow: "inset 0 0 0 1px rgba(44,47,54,0.52), inset 0 0 50px 0 rgba(255,255,255,0.02)",
        overflow: "hidden",
        position: "relative",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div style={{ padding: "7px 7px 8px", display: "flex", flexDirection: "column", height: 122 }}>
        {onMention ? (
          <button
            type="button"
            onClick={onMention}
            title="Focus the message box"
            style={{ display: "inline-flex", alignItems: "center", width: "fit-content", height: 24, padding: "0 4px", marginLeft: 1, ...CHIP, border: "none", cursor: "pointer" }}
          >
            {mention ?? <AtSignIcon />}
          </button>
        ) : (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              width: "fit-content",
              height: 24,
              padding: "0 4px",
              marginLeft: 1,
              ...CHIP,
            }}
          >
            {mention ?? <AtSignIcon />}
          </div>
        )}
        {controlled ? (
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => onValueChange?.(e.target.value)}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter') onEnter?.();
              if (e.key === 'Escape') onEscape?.();
            }}
            placeholder={placeholder ?? 'Build anything...'}
            spellCheck={false}
            className="placeholder:text-[#4e4e4e]"
            style={{ fontSize: 13, lineHeight: "16px", color: "#E5E7EB", padding: "16px 4px 0", background: "transparent", border: "none", outline: "none", width: "100%" }}
          />
        ) : (
          <div style={{ fontSize: 13, lineHeight: "16px", color: "#4e4e4e", padding: "16px 4px 0" }}>{placeholder ?? "Build anything..."}</div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: "auto" }}>
          {agent?.onClick ? (
            <button
              type="button"
              onClick={agent.onClick}
              title={agent.title}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 24, padding: "0 6px 0 8px", fontSize: 12, lineHeight: "14px", color: "#caccd2", marginLeft: 1, ...CHIP, border: "none", cursor: "pointer", userSelect: "none" }}
            >
              {agent.label ?? "Agent"}
              <ChevronDownIcon />
            </button>
          ) : (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 24, padding: "0 6px 0 8px", fontSize: 12, lineHeight: "14px", color: "#caccd2", marginLeft: 1, ...CHIP }}>
              {agent?.label ?? "Agent"}
              <ChevronDownIcon />
            </div>
          )}
          {auto?.onClick ? (
            <button
              type="button"
              onClick={auto.onClick}
              title={auto.title}
              style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 24, padding: "0 6px 0 8px", fontSize: 12, lineHeight: "14px", color: auto.active ? "#22D3EE" : "#caccd2", ...CHIP, border: "none", cursor: "pointer", userSelect: "none" }}
            >
              {auto.active && (
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22D3EE", boxShadow: "0 0 6px #22D3EE" }} />
              )}
              Auto
              <ChevronDownIcon />
            </button>
          ) : (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 24, padding: "0 6px 0 8px", fontSize: 12, lineHeight: "14px", color: "#caccd2", ...CHIP }}>
              Auto
              <ChevronDownIcon />
            </div>
          )}
          {extraChips}
          {onSend ? (
            <button
              type="button"
              onClick={onSend}
              title="Send"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, marginLeft: "auto", padding: "0 8px", ...CHIP, border: "none", cursor: "pointer", userSelect: "none" }}
            >
              <ArrowUpIcon color={hasText && sendColor ? sendColor : "#8B8B8B"} />
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, marginLeft: "auto", padding: "0 8px", ...CHIP }}>
              <ArrowUpIcon color={hasText && sendColor ? sendColor : "#8B8B8B"} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { ChatInput };

export default function Default() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 600,
        maxWidth: "100%",
        minHeight: 360,
        margin: "0 auto",
        background: "#0d0d0f",
        borderRadius: 24,
      }}
    >
      <BorderBeam size="md" colorVariant="colorful">
        <ChatInput />
      </BorderBeam>
    </div>
  );
}
