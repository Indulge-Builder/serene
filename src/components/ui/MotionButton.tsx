'use client';

/**
 * MotionButton — Framer Motion wrapper around Button.
 *
 * Uses motion() factory to wrap the forwardRef Button component.
 * Zero Button internals are duplicated here.
 * Non-animated callers import Button directly — MotionButton adds zero
 * bundle cost to those consumers.
 *
 * Default motion values (all overridable via props):
 *   whileTap:  { scale: 0.97 }
 *   transition: spring, stiffness 400, damping 30, duration INSTANT_DURATION
 */

import { m as motion } from 'framer-motion';
import { Button } from './Button';
import { INSTANT_DURATION, EASE_SPRING } from '@/lib/constants/motion';

export const MotionButton = motion.create(Button);

/** Default tap + spring transition — spread onto MotionButton when you want the
 *  standard press-down feel without custom override. */
export const MOTION_BUTTON_DEFAULTS = {
  whileTap:   { scale: 0.97 },
  transition: {
    type:      'spring' as const,
    stiffness: 400,
    damping:   30,
    duration:  INSTANT_DURATION,
    ease:      EASE_SPRING,
  },
} as const;
