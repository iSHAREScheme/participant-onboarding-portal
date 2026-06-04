import { Html, Head, Main, NextScript } from 'next/document'
import Script from 'next/script'
import { fontVariablesClassName } from '../config/fonts'

export default function Document() {
  return (
    <Html lang="en" className={fontVariablesClassName}>
      <Head>
        {/* iSHARE default favicon; a deployment can override it from Settings →
            Theme (SettingsContext swaps this link's href to the uploaded one). */}
        <link rel="icon" href="/resources/img/logo-mark.png" />
        <Script src="/env.js" strategy="beforeInteractive" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
