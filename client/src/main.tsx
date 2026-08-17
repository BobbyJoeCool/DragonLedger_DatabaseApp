import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import { Layout } from '@/components/layout/Layout'
import { BrowseScreen } from '@/screens/BrowseScreen'
import { CreateScreen } from '@/screens/CreateScreen'
import { DetailScreen } from '@/screens/DetailScreen'
import { EditScreen } from '@/screens/EditScreen'
import { SubraceDetailScreen } from '@/screens/SubraceDetailScreen'
import { SubraceForm } from '@/components/content/SubraceForm'
import { SubclassDetailScreen } from '@/screens/SubclassDetailScreen'
import { SubclassForm } from '@/components/content/SubclassForm'
import { CreateHubScreen } from '@/screens/CreateHubScreen'
import { DisplayScreen } from '@/screens/DisplayScreen'
import { SourcesScreen } from '@/screens/SourcesScreen'
import { ImportScreen } from '@/screens/ImportScreen'
import { LoginScreen } from '@/screens/LoginScreen'

const queryClient = new QueryClient()

const router = createBrowserRouter([
  { path: '/login', element: <LoginScreen /> },
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/browse" replace /> },
      { path: 'browse', element: <BrowseScreen /> },
      // Subrace/Subclass are nested-only (reached from their parent's
      // card), not top-level ContentTypes — literal routes ahead of the
      // generic :type ones below.
      { path: 'browse/races/:raceId/subraces/new', element: <SubraceForm mode="create" /> },
      { path: 'browse/subraces/:id', element: <SubraceDetailScreen /> },
      { path: 'browse/subraces/:id/edit', element: <SubraceForm mode="edit" /> },
      { path: 'browse/classes/:classId/subclasses/new', element: <SubclassForm mode="create" /> },
      { path: 'browse/subclasses/:id', element: <SubclassDetailScreen /> },
      { path: 'browse/subclasses/:id/edit', element: <SubclassForm mode="edit" /> },
      { path: 'browse/:type/new', element: <CreateScreen /> },
      { path: 'browse/:type/:id', element: <DetailScreen /> },
      { path: 'browse/:type/:id/edit', element: <EditScreen /> },
      { path: 'create', element: <CreateHubScreen /> },
      { path: 'display', element: <DisplayScreen /> },
      { path: 'sources', element: <SourcesScreen /> },
      { path: 'sources/import', element: <ImportScreen /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
