import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-md border px-1.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none',
  { variants: { variant: {
      default: 'border-transparent bg-primary text-primary-foreground',
      secondary: 'border-transparent bg-secondary text-secondary-foreground',
      outline: 'text-foreground',
      up: 'border-transparent bg-[color-mix(in_oklab,var(--up)_10%,white)] text-up',
      down: 'border-transparent bg-[color-mix(in_oklab,var(--down)_9%,white)] text-down',
    } }, defaultVariants: { variant: 'default' } }
);
function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { Badge, badgeVariants };
