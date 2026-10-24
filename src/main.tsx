import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/newsreader'
import '@fontsource-variable/newsreader/wght-italic.css'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import LibraryApp from './Library'
createRoot(document.getElementById('root')!).render(<StrictMode><LibraryApp /></StrictMode>)

