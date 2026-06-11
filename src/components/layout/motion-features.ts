// Framer Motion feature bundle, async-loaded by MotionProvider (perf audit G-2).
// domMax (not domAnimation) because the app uses shared-layout animations:
// TabSelector's layoutId indicator pill and the toast stack's `layout` prop.
// Own module so the bundler splits it into its own chunk — the initial route
// chunks carry only the ~6kb `m` component core.
import { domMax } from "framer-motion";

export default domMax;
