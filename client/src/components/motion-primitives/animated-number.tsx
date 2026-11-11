import { cn } from '@/lib/utils';
import { motion, SpringOptions, useSpring, useTransform } from 'motion/react';
import { useEffect } from 'react';

export type AnimatedNumberProps = {
  value: number;
  decimals?: number;
  className?: string;
  springOptions?: SpringOptions;
};

// From motion-primitives (animated-number). Changes: `decimals` prop, no per-render motion.create.
export function AnimatedNumber({ value, decimals = 0, className, springOptions }: AnimatedNumberProps) {
  const spring = useSpring(0, springOptions);
  const display = useTransform(spring, (current) => current.toFixed(decimals));

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  return <motion.span className={cn('tabular-nums', className)}>{display}</motion.span>;
}
