'use client';

import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader,
  PlayCircle,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { TASK_STATUS } from '@/lib/constants/task-constants';
import type { TaskStatus } from '@/lib/types/database';

export interface TaskStatusIconProps {
  status: TaskStatus;
  className?: string;
  /** Icon edge length in px. Default 13. */
  size?: number;
}

export function TaskStatusIcon({ status, className, size = 13 }: TaskStatusIconProps) {
  const { color } = TASK_STATUS[status];
  const style = {
    width: size,
    height: size,
    strokeWidth: 1.5,
    flexShrink: 0 as const,
    color,
  };

  switch (status) {
    case 'to_do':
      return <Clock className={className} style={style} />;
    case 'in_progress':
      return <PlayCircle className={className} style={style} />;
    case 'in_review':
      return <RefreshCw className={className} style={style} />;
    case 'completed':
      return <CheckCircle2 className={className} style={style} />;
    case 'error':
      return <AlertCircle className={className} style={style} />;
    case 'cancelled':
      return <XCircle className={className} style={style} />;
    default:
      return <Loader className={className} style={style} />;
  }
}
