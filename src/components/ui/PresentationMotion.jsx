/* oxlint-disable react/only-export-components -- Shared presentation props and their paragraph renderer intentionally live together. */
import { motion, useReducedMotion } from 'framer-motion'

// Presentation only: no DOM wrappers, routing state or form behavior.
export const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
}

export function listItem(motionSafe) {
  return { ...itemVariants, visible: { ...itemVariants.visible, transition: { ...itemVariants.visible.transition, duration: motionSafe ? 0.3 : 0 } } }
}

export function entrance(motionSafe, index = 0, inView = false) {
  return {
    'data-ui-motion': true,
    initial: motionSafe ? 'hidden' : false,
    [inView ? 'whileInView' : 'animate']: 'visible',
    ...(inView ? { viewport: { once: true, amount: 0.12 } } : {}),
    variants: {
      hidden: itemVariants.hidden,
      visible: { opacity: 1, y: 0, transition: { duration: motionSafe ? 0.3 : 0, delay: motionSafe ? index * 0.06 : 0, ease: 'easeOut' } },
    },
  }
}

export function stagger(motionSafe, inView = false) {
  return {
    'data-ui-motion': true,
    initial: motionSafe ? 'hidden' : false,
    [inView ? 'whileInView' : 'animate']: 'visible',
    ...(inView ? { viewport: { once: true, amount: 0.12 } } : {}),
    variants: { hidden: {}, visible: { transition: { staggerChildren: motionSafe ? 0.06 : 0 } } },
  }
}

export function hoverLift(motionSafe) {
  return motionSafe ? { y: -1, transition: { duration: 0.18, ease: 'easeOut' } } : undefined
}

export function fade(motionSafe) {
  return { 'data-ui-motion': true, initial: motionSafe ? { opacity: 0 } : false, animate: { opacity: 1 }, transition: { duration: motionSafe ? 0.2 : 0, ease: 'easeOut' } }
}

// Renders the same paragraph; callers retain all attributes and children.
export function FadeMessage(props) {
  const motionSafe = !useReducedMotion()
  return <motion.p {...fade(motionSafe)} {...props} />
}
