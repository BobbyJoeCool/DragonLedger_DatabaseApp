import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import './index.css'
import { Layout } from '@/components/layout/Layout'
import { BrowseScreen } from '@/screens/BrowseScreen'
import { DetailScreen } from '@/screens/DetailScreen'
import { SourcesScreen } from '@/screens/SourcesScreen'
import { ImportScreen } from '@/screens/ImportScreen'
import { LoginScreen } from '@/screens/LoginScreen'

const router = createBrowserRouter([
  { path: '/login', element: <LoginScreen /> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/browse" replace /> },
      { path: 'browse', element: <BrowseScreen /> },
      { path: 'browse/:type/:id', element: <DetailScreen /> },
      { path: 'sources', element: <SourcesScreen /> },
      { path: 'sources/import', element: <ImportScreen /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
