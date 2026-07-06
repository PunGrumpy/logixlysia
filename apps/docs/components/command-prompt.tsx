'use client'

import { IconCheck, IconCopy } from '@tabler/icons-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Children,
  type ComponentPropsWithoutRef,
  createContext,
  type Dispatch,
  isValidElement,
  type ReactElement,
  type ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react'
import { cn } from '@/lib/utils'

interface CommandPromptContextType {
  activeCopyValue: string
  canShowGradient: boolean
  commandWidth: number | undefined
  copied: boolean
  copyActiveValue: () => void
  isOverflowing: boolean
  setActiveCopyValue: Dispatch<SetStateAction<string>>
  setCanShowGradient: Dispatch<SetStateAction<boolean>>
  setCommandWidth: Dispatch<SetStateAction<number | undefined>>
  setIsOverflowing: Dispatch<SetStateAction<boolean>>
  setValue: (value: string) => void
  value: string
}

const CommandPromptContext = createContext<CommandPromptContextType | null>(
  null
)

const useCommandPromptContext = (
  component: string
): CommandPromptContextType => {
  const context = useContext(CommandPromptContext)
  if (!context) {
    throw new Error(`${component} must be used within CommandPrompt.Root`)
  }
  return context
}

type CommandPromptRootProps = Omit<
  ComponentPropsWithoutRef<'div'>,
  'onChange'
> & {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}

export const CommandPromptRoot = ({
  value: valueProp,
  defaultValue,
  onValueChange,
  className,
  children,
  ...props
}: CommandPromptRootProps) => {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? '')
  const [copied, setCopied] = useState(false)
  const [activeCopyValue, setActiveCopyValue] = useState('')
  const [commandWidth, setCommandWidth] = useState<number>()
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [canShowGradient, setCanShowGradient] = useState(true)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const value = valueProp ?? uncontrolledValue

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    },
    []
  )

  const resetCopiedState = (): void => {
    setCopied(false)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
  }

  const setValue = (nextValue: string): void => {
    if (valueProp === undefined) {
      setUncontrolledValue(nextValue)
    }
    resetCopiedState()
    onValueChange?.(nextValue)
  }

  const copyActiveValue = (): void => {
    if (!activeCopyValue) {
      return
    }
    navigator.clipboard.writeText(activeCopyValue)
    setCopied(true)
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = setTimeout(() => setCopied(false), 1000)
  }

  return (
    <CommandPromptContext.Provider
      value={{
        value,
        setValue,
        copied,
        copyActiveValue,
        activeCopyValue,
        setActiveCopyValue,
        commandWidth,
        setCommandWidth,
        isOverflowing,
        setIsOverflowing,
        canShowGradient,
        setCanShowGradient
      }}
    >
      <div
        className={cn('flex w-full flex-col items-center gap-2', className)}
        {...props}
      >
        {children}
      </div>
    </CommandPromptContext.Provider>
  )
}

export const CommandPromptList = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) => (
  <div
    className={cn(
      'flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1 shadow-xs dark:bg-muted/20',
      className
    )}
    {...props}
  />
)

type CommandPromptTriggerProps = ComponentPropsWithoutRef<'button'> & {
  value: string
}

export const CommandPromptTrigger = ({
  value,
  className,
  onClick,
  children,
  ...props
}: CommandPromptTriggerProps) => {
  const context = useCommandPromptContext('CommandPrompt.Trigger')
  const active = context.value === value

  return (
    <button
      aria-pressed={active}
      className={cn(
        'cursor-pointer select-none rounded-full bg-transparent px-3 py-0.5 font-medium text-muted-foreground text-xs transition-[color,background-color,transform] duration-200 active:scale-[0.96]',
        'hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'data-active:bg-background data-active:text-foreground data-active:shadow-xs',
        className
      )}
      data-active={active ? '' : undefined}
      onClick={event => {
        onClick?.(event)
        if (event.defaultPrevented) {
          return
        }
        context.setValue(value)
      }}
      type="button"
      {...props}
    >
      {children}
    </button>
  )
}

export const CommandPromptTriggerDivider = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'div'>) => (
  <div
    aria-hidden
    className={cn('mx-1.5 h-3 w-px bg-border/60', className)}
    {...props}
  />
)

export const CommandPromptSurface = ({
  className,
  onClick,
  children
}: {
  className?: string
  children: ReactNode
  onClick?: ComponentPropsWithoutRef<'div'>['onClick']
}) => {
  const context = useCommandPromptContext('CommandPrompt.Surface')
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      className={cn(
        'group relative flex max-w-[calc(100vw-48px)] cursor-pointer select-none items-center gap-2 rounded-full border border-border bg-card/60 py-1.5 pr-2 pl-5 shadow-xs backdrop-blur-xs transition-[border-color,background-color] duration-200 hover:border-muted-foreground/30 hover:bg-card/90',
        className
      )}
      layout
      onClick={event => {
        onClick?.(event)
        if (event.defaultPrevented) {
          return
        }
        if (window.getSelection()?.toString()) {
          return
        }
        context.copyActiveValue()
      }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { type: 'spring', bounce: 0, duration: 0.4 }
      }
    >
      {children}
    </motion.div>
  )
}

export const CommandPromptPrefix = ({
  className,
  ...props
}: ComponentPropsWithoutRef<'span'>) => (
  <span
    className={cn(
      'block select-none pr-0.5 font-mono text-muted-foreground text-xs',
      className
    )}
    {...props}
  />
)

interface CommandPromptContentProps {
  children: ReactNode
  className?: string
  copyValue?: string
  value: string
}

export const CommandPromptViewport = ({
  className,
  children
}: {
  className?: string
  children: ReactNode
}) => {
  const context = useCommandPromptContext('CommandPrompt.Viewport')
  const shouldReduceMotion = useReducedMotion()
  const {
    commandWidth,
    canShowGradient,
    isOverflowing,
    setActiveCopyValue,
    setCanShowGradient,
    setCommandWidth,
    setIsOverflowing
  } = context

  const measureRef = useRef<HTMLSpanElement | null>(null)
  const scrollObserverCleanup = useRef<(() => void) | null>(null)

  const items = Children.toArray(children)
    .filter((child): child is ReactElement<CommandPromptContentProps> =>
      isValidElement(child)
    )
    .map(child => child.props)

  const activeItem = items.find(item => item.value === context.value)
  const command = activeItem?.children ?? null

  const fallbackCopyValue =
    typeof command === 'string' || typeof command === 'number'
      ? String(command)
      : Children.toArray(command)
          .filter(
            child => typeof child === 'string' || typeof child === 'number'
          )
          .join('')

  const copyValue = activeItem?.copyValue ?? fallbackCopyValue

  // biome-ignore lint/correctness/useExhaustiveDependencies: copyValue must reset the overflow/gradient state when the active command changes.
  useLayoutEffect(() => {
    setIsOverflowing(false)
    setCanShowGradient(Boolean(shouldReduceMotion))
  }, [copyValue, setCanShowGradient, setIsOverflowing, shouldReduceMotion])

  useEffect(() => {
    setActiveCopyValue(copyValue)
    return () => {
      setIsOverflowing(false)
      scrollObserverCleanup.current?.()
      scrollObserverCleanup.current = null
    }
  }, [copyValue, setActiveCopyValue, setIsOverflowing])

  // biome-ignore lint/correctness/useExhaustiveDependencies: command/copyValue must re-measure the width to drive the resize animation when the active command changes.
  useLayoutEffect(() => {
    if (!measureRef.current) {
      return
    }
    setCommandWidth(measureRef.current.getBoundingClientRect().width)
  }, [command, copyValue, setCommandWidth])

  return (
    <motion.span
      animate={
        commandWidth === undefined
          ? undefined
          : { width: shouldReduceMotion ? 'auto' : commandWidth }
      }
      className={cn(
        'relative block min-w-0 overflow-hidden font-mono text-foreground text-xs',
        className
      )}
      initial={false}
      onAnimationComplete={() => {
        setCanShowGradient(true)
      }}
      transition={
        shouldReduceMotion
          ? { duration: 0 }
          : { type: 'spring', bounce: 0, duration: 0.4 }
      }
    >
      <span
        aria-hidden
        className="pointer-events-none invisible absolute whitespace-nowrap"
        ref={measureRef}
      >
        {command}
      </span>
      <AnimatePresence initial={false} mode="wait">
        {Children.toArray(children).map(child => {
          if (!isValidElement(child)) {
            return null
          }
          const typedChild = child as ReactElement<CommandPromptContentProps>
          if (typedChild.props.value !== context.value) {
            return null
          }
          return (
            <motion.span
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              className={cn(
                'block min-w-0 whitespace-nowrap py-1.5',
                canShowGradient && isOverflowing
                  ? 'overflow-x-auto'
                  : 'overflow-x-hidden',
                typedChild.props.className
              )}
              exit={{ opacity: 0, filter: 'blur(1px)' }}
              initial={{ opacity: 0, filter: 'blur(1px)' }}
              key={copyValue}
              ref={element => {
                scrollObserverCleanup.current?.()
                scrollObserverCleanup.current = null
                if (!element) {
                  return
                }
                const checkOverflow = () => {
                  setIsOverflowing(element.scrollWidth > element.clientWidth)
                }
                checkOverflow()
                const observer = new ResizeObserver(checkOverflow)
                observer.observe(element)
                scrollObserverCleanup.current = () => observer.disconnect()
              }}
              transition={
                shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }
              }
            >
              {typedChild.props.children}
            </motion.span>
          )
        })}
      </AnimatePresence>
      <AnimatePresence>
        {canShowGradient && isOverflowing && (
          <motion.span
            animate={{ opacity: 1 }}
            aria-hidden
            className="pointer-events-none absolute top-0 right-0 bottom-0 z-10 block w-4 bg-linear-to-r from-transparent to-card"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={
              shouldReduceMotion ? { duration: 0 } : { duration: 0.2 }
            }
          />
        )}
      </AnimatePresence>
    </motion.span>
  )
}

export const CommandPromptContent = (_props: CommandPromptContentProps): null =>
  null

export const CommandPromptCopy = ({
  className,
  onClick,
  ...props
}: ComponentPropsWithoutRef<'button'>) => {
  const context = useCommandPromptContext('CommandPrompt.Copy')
  const shouldReduceMotion = useReducedMotion()

  return (
    <button
      aria-label={context.copied ? 'Copied' : 'Copy command'}
      className={cn(
        'relative flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent bg-transparent text-muted-foreground',
        'select-none transition-[background-color,color,transform] duration-200 hover:bg-muted hover:text-foreground active:scale-[0.96]',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'after:absolute after:-inset-1.5',
        className
      )}
      onClick={event => {
        onClick?.(event)
        if (event.defaultPrevented) {
          return
        }
        event.stopPropagation()
        context.copyActiveValue()
      }}
      type="button"
      {...props}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {context.copied ? (
          <motion.span
            animate={{
              opacity: 1,
              scale: 1,
              filter: 'blur(0px)'
            }}
            className="flex items-center justify-center text-emerald-500 dark:text-emerald-400"
            exit={{
              opacity: 0,
              scale: 0.25,
              filter: 'blur(4px)'
            }}
            initial={{
              opacity: 0,
              scale: 0.25,
              filter: 'blur(4px)'
            }}
            key="check"
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { type: 'spring', duration: 0.3, bounce: 0 }
            }
          >
            <IconCheck className="block size-3.5" size={14} />
          </motion.span>
        ) : (
          <motion.span
            animate={{
              opacity: 1,
              scale: 1,
              filter: 'blur(0px)'
            }}
            className="flex items-center justify-center"
            exit={{
              opacity: 0,
              scale: 0.25,
              filter: 'blur(4px)'
            }}
            initial={{
              opacity: 0,
              scale: 0.25,
              filter: 'blur(4px)'
            }}
            key="copy"
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { type: 'spring', duration: 0.3, bounce: 0 }
            }
          >
            <IconCopy className="block size-3.5" size={14} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}
