/**
 * Layout
 *
 * App shell — renders the header and wraps page content.
 * All pages live inside <Layout>.
 */

import type { ReactNode } from 'react'
import styles from './Layout.module.css'

interface LayoutProps {
  children: ReactNode
}

function Layout({ children }: LayoutProps) {
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <span className={styles.logo}>TWM</span>
          <span className={styles.tagline}>TravelWithMe</span>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  )
}

export default Layout
