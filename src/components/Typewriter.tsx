import { useEffect, useState, type CSSProperties } from 'react';
import { motion, type Variants } from 'framer-motion';

interface TypewriterProps {
  texts: string[];
  prefix?: string;
  typeDelayMs?: number;
  holdMs?: number;
  deleteDelayMs?: number;
  color?: string;
  typedColor?: string;
  cursorColor?: string;
  cursorChar?: string;
  showCursor?: boolean;
  fontSize?: string;
  fontWeight?: number;
  letterSpacing?: string;
  style?: CSSProperties;
}

const cursorVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.01, repeat: Infinity, repeatDelay: 0.4, repeatType: 'reverse' },
  },
};

export function Typewriter({
  texts,
  prefix = '',
  typeDelayMs = 70,
  holdMs = 1500,
  deleteDelayMs = 100,
  color = '#D7E2EA',
  typedColor = '#D7E2EA',
  cursorColor = '#3B82F6',
  cursorChar = '_',
  showCursor = true,
  fontSize = '80px',
  fontWeight = 400,
  letterSpacing = '-0.025em',
  style,
}: TypewriterProps) {
  const list = texts.filter((t): t is string => typeof t === 'string');
  const [displayText, setDisplayText] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);

  useEffect(() => {
    if (!list.length) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const currentText = list[currentTextIndex] ?? '';

    if (isDeleting) {
      if (displayText === '') {
        setIsDeleting(false);
        setCurrentTextIndex((prev) => (prev + 1) % list.length);
        setCurrentIndex(0);
        timeout = setTimeout(() => {}, holdMs);
      } else {
        timeout = setTimeout(() => setDisplayText((prev) => prev.slice(0, -1)), deleteDelayMs);
      }
    } else {
      if (currentIndex < currentText.length) {
        timeout = setTimeout(() => {
          setDisplayText((prev) => prev + currentText[currentIndex]);
          setCurrentIndex((prev) => prev + 1);
        }, typeDelayMs);
      } else if (list.length > 1) {
        timeout = setTimeout(() => setIsDeleting(true), holdMs);
      }
    }
    return () => { if (timeout) clearTimeout(timeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, displayText, isDeleting, currentTextIndex, typeDelayMs, deleteDelayMs, holdMs]);

  useEffect(() => {
    setDisplayText('');
    setCurrentIndex(0);
    setIsDeleting(false);
    setCurrentTextIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.join('')]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', ...style }}>
      <div
        style={{
          display: 'inline',
          whiteSpace: 'pre-wrap',
          fontSize,
          fontWeight,
          letterSpacing,
          lineHeight: 1.4,
          color,
        }}
      >
        {prefix && <span>{prefix}</span>}
        <span style={{ color: typedColor }}>{displayText}</span>
        {showCursor && (
          <motion.span
            variants={cursorVariants}
            initial="initial"
            animate="animate"
            style={{ color: cursorColor, marginLeft: '0.25rem' }}
          >
            {cursorChar}
          </motion.span>
        )}
      </div>
    </div>
  );
}
