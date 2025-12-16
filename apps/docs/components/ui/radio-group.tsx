'use client'

import { Radio as RadioPrimitive } from '@base-ui/react/radio'
import { RadioGroup as RadioGroupPrimitive } from '@base-ui/react/radio-group'
import { IconCircle } from '@tabler/icons-react'
import { cn } from '@/lib/utils'

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      className={cn('grid w-full gap-3', className)}
      data-slot="radio-group"
      {...props}
    />
  )
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      className={cn(
        'group/radio-group-item peer after:-inset-x-3 after:-inset-y-2 relative flex aspect-square size-4 shrink-0 rounded-full border border-input text-primary shadow-xs outline-none after:absolute focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className
      )}
      data-slot="radio-group-item"
      {...props}
    >
      <RadioPrimitive.Indicator
        className="flex size-4 items-center justify-center text-primary group-aria-invalid/radio-group-item:text-destructive"
        data-slot="radio-group-indicator"
      >
        <IconCircle className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 size-2 fill-current" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  )
}

export { RadioGroup, RadioGroupItem }
