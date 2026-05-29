'use client';

import React, {
  createContext,
  useContext,
  useState,
} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SPRING_CONFIG, BASE_DURATION, EASE_OUT_EXPO } from '@/lib/constants/motion';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TabSelectorVariant = 'pill' | 'border-bottom' | 'connected';

// ─── Context ──────────────────────────────────────────────────────────────────

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
  layoutId: string;
  animatedContent: boolean;
  variant: TabSelectorVariant;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error('TabsTrigger / TabsList / TabsContent must be used inside <Tabs>');
  }
  return ctx;
}

// ─── Tabs (root) ──────────────────────────────────────────────────────────────

export interface TabsProps {
  /** Controlled active value */
  value?: string;
  /** Uncontrolled initial value */
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /**
   * Unique layoutId for the spring pill indicator.
   * Pass a distinct ID whenever two <Tabs> groups are simultaneously mounted
   * (e.g. a page-level tab bar and a card-level tab bar). Sharing the default
   * id causes Framer shared-layout to treat them as the same element and jump
   * the pill between unrelated groups.
   *
   * Example:
   *   <Tabs indicatorLayoutId="tasks-tab-bar">…</Tabs>
   *   <Tabs indicatorLayoutId="subtask-period-tabs">…</Tabs>
   */
  indicatorLayoutId?: string;
  /** Whether TabsContent panels animate in/out. Default true. */
  animatedContent?: boolean;
  variant?: TabSelectorVariant;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Tabs({
  value: controlledValue,
  defaultValue,
  onValueChange,
  indicatorLayoutId = 'eia-tab-indicator',
  animatedContent = true,
  variant = 'pill',
  children,
  className,
  style,
}: TabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? '');
  const activeValue = controlledValue ?? uncontrolledValue;

  function handleChange(next: string) {
    if (controlledValue === undefined) {
      setUncontrolledValue(next);
    }
    onValueChange?.(next);
  }

  return (
    <TabsContext.Provider
      value={{
        value: activeValue,
        onValueChange: handleChange,
        layoutId: indicatorLayoutId,
        animatedContent,
        variant,
      }}
    >
      <div className={className} style={style}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

// ─── TabsList ─────────────────────────────────────────────────────────────────

export interface TabsListProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function TabsList({ children, className, style }: TabsListProps) {
  const { variant } = useTabsContext();

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    position: 'relative',
    ...(variant === 'pill' && {
      background: 'var(--theme-paper-subtle)',
      border: '1px solid var(--theme-paper-border)',
      borderRadius: 'var(--radius-xl)',
      padding: 'var(--space-1)',
      gap: 'var(--space-1)',
    }),
    ...(variant === 'border-bottom' && {
      background: 'transparent',
      borderBottom: '1px solid var(--theme-paper-border)',
      borderRadius: 0,
      gap: 0,
    }),
    ...(variant === 'connected' && {
      background: 'var(--theme-paper-subtle)',
      border: '1px solid var(--theme-paper-border)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-1)',
      gap: 0,
    }),
    ...style,
  };

  return (
    <div role="tablist" className={className} style={containerStyle}>
      {children}
    </div>
  );
}

// ─── TabsTrigger ──────────────────────────────────────────────────────────────

export interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function TabsTrigger({
  value,
  children,
  disabled,
  className,
  style,
}: TabsTriggerProps) {
  const { value: activeValue, onValueChange, layoutId, variant } = useTabsContext();
  const isActive = value === activeValue;
  const isConnected = variant === 'connected';
  const isBorderBottom = variant === 'border-bottom';

  // Pill variant: active text sits on a dark canvas chip — use canvas-text.
  // Other variants retain their existing colour logic.
  const isPill = variant === 'pill';
  const activeTextColor = isPill
    ? 'var(--theme-canvas-text)'
    : (isConnected ? 'var(--theme-text-primary)' : 'var(--theme-accent)');

  const buttonStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--space-1)',
    paddingTop: 'var(--space-2)',
    paddingBottom: 'var(--space-2)',
    paddingLeft: 'var(--space-4)',
    paddingRight: 'var(--space-4)',
    fontSize: 'var(--text-sm)',
    fontWeight: isActive ? 'var(--weight-semibold)' : 'var(--weight-medium)',
    fontFamily: 'var(--font-sans)',
    // Colour is intentionally transparent on the root for pill variant —
    // text colour is handled on the inner content span (see below) so the
    // transition applies to the text only, not to the pill element.
    color: isPill ? 'transparent' : (isActive ? activeTextColor : 'var(--theme-text-secondary)'),
    background: 'transparent',
    border: 'none',
    borderRadius: isBorderBottom ? 0 : (isConnected ? 'var(--radius-sm)' : 'var(--radius-lg)'),
    cursor: disabled ? 'default' : 'pointer',
    transition: 'var(--transition-hover)',
    whiteSpace: 'nowrap',
    outline: 'none',
    zIndex: 1,
    marginBottom: isBorderBottom ? -1 : 0,
    flex: isConnected ? 1 : undefined,
    justifyContent: isConnected ? 'center' : undefined,
    opacity: disabled ? 0.5 : 1,
    pointerEvents: disabled ? 'none' : undefined,
    ...style,
  };

  return (
    <button
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => !disabled && onValueChange(value)}
      className={className}
      style={buttonStyle}
      onFocus={(e) => {
        e.currentTarget.setAttribute('data-focus-visible', 'true');
      }}
      onBlur={(e) => {
        e.currentTarget.removeAttribute('data-focus-visible');
      }}
    >
      {/* Pill variant spring indicator — dark canvas chip */}
      {isPill && isActive && (
        <motion.span
          layoutId={layoutId}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--theme-canvas)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--theme-sidebar-border)',
            boxShadow: 'var(--shadow-2)',
            zIndex: -1,
          }}
          transition={SPRING_CONFIG}
        />
      )}

      {/* Connected variant spring indicator */}
      {isConnected && isActive && (
        <motion.span
          layoutId={`${layoutId}-connected`}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--theme-paper)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-1)',
            zIndex: -1,
          }}
          transition={SPRING_CONFIG}
        />
      )}

      {/* Border-bottom variant underline indicator */}
      {isBorderBottom && isActive && (
        <motion.span
          layoutId={`${layoutId}-underline`}
          style={{
            position: 'absolute',
            bottom: -1,
            left: 0,
            right: 0,
            width: '100%',
            height: 2,
            background: 'var(--theme-accent)',
            borderRadius: 'var(--radius-full)',
          }}
          transition={SPRING_CONFIG}
        />
      )}

      {/*
        Content span — sits above the pill via position:relative + z-index:1.
        For the pill variant, text colour lives here (not on the button root)
        so the colour transition applies only to the label, not to the pill element.
        The button root is colour:transparent for pill to avoid colouring the
        absolute-positioned pill child.
      */}
      {isPill ? (
        <span
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            color: isActive ? 'var(--theme-canvas-text)' : 'var(--theme-text-secondary)',
            transition: `color var(--duration-fast) var(--ease-in-out)`,
          }}
        >
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

// ─── TabsContent ──────────────────────────────────────────────────────────────

export interface TabsContentProps {
  value: string;
  /** Override animated behaviour from root Tabs context */
  animated?: boolean;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function TabsContent({
  value,
  animated,
  children,
  className,
  style,
}: TabsContentProps) {
  const { value: activeValue, animatedContent } = useTabsContext();
  const isActive = value === activeValue;
  const shouldAnimate = animated ?? animatedContent;

  return (
    // forceMount: panel stays in DOM when inactive — preserves scroll position (Design-DNA rule).
    // The motion.div inside is rendered conditionally so AnimatePresence can animate it.
    <div
      role="tabpanel"
      aria-hidden={!isActive}
      className={className}
      style={{
        display: isActive ? undefined : 'none',
        ...style,
      }}
    >
      {shouldAnimate ? (
        <AnimatePresence mode="wait">
          {isActive && (
            <motion.div
              key={value}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: BASE_DURATION, ease: EASE_OUT_EXPO }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        children
      )}
    </div>
  );
}

/** Internal badge with explicit isActive — used by TabSelector wrapper */
function _CountBadge({
  children,
  isActive,
}: {
  children: React.ReactNode;
  isActive: boolean;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 18,
        height: 18,
        padding: '0 var(--space-1)',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--text-2xs)',
        fontWeight: 'var(--weight-semibold)',
        background: isActive ? 'var(--theme-accent-surface)' : 'var(--theme-paper-subtle)',
        color: isActive ? 'var(--theme-accent)' : 'var(--theme-text-tertiary)',
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
}

// ─── TabSelector — backwards-compatibility wrapper ────────────────────────────
//
// All existing consumers pass { tabs, activeTab, onChange } to a single
// <TabSelector> element. This wrapper composes the new compound components
// so existing consumers work with zero changes.

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export interface TabSelectorProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  variant?: TabSelectorVariant;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Forwarded to indicatorLayoutId. Required when multiple TabSelector
   * instances are simultaneously visible on the same page.
   */
  indicatorLayoutId?: string;
}

export function TabSelector({
  tabs,
  activeTab,
  onChange,
  variant = 'pill',
  className,
  style,
  indicatorLayoutId,
}: TabSelectorProps) {
  return (
    <Tabs
      value={activeTab}
      onValueChange={onChange}
      variant={variant}
      indicatorLayoutId={indicatorLayoutId}
      animatedContent={false}
      className={className}
      style={style}
    >
      <TabsList>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
              {tab.count !== undefined && (
                <_CountBadge isActive={isActive}>{tab.count}</_CountBadge>
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
