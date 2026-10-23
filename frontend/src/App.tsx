import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

const API_URL = import.meta.env.VITE_API_URL ?? '/api'
const ACCESS_TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'

type Tokens = {
  access: string
  refresh: string
}

type User = {
  username: string
}

type ApiError = {
  detail?: string
  username?: string[]
  password?: string[]
}

function saveTokens(tokens: Tokens) {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access)
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh)
}

function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

async function getErrorMessage(response: Response) {
  const error = (await response.json().catch(() => ({}))) as ApiError
  return (
    error.detail ??
    error.username?.[0] ??
    error.password?.[0] ??
    `Не удалось выполнить запрос (ошибка ${response.status}).`
  )
}

async function refreshAccessToken() {
  const refresh = localStorage.getItem(REFRESH_TOKEN_KEY)
  if (!refresh) {
    clearTokens()
    throw new Error('Сессия завершена. Войдите снова.')
  }

  const response = await fetch(`${API_URL}/auth/token/refresh/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  })

  if (!response.ok) {
    clearTokens()
    throw new Error('Сессия завершена. Войдите снова.')
  }

  const tokens = (await response.json()) as { access: string; refresh?: string }
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access)
  if (tokens.refresh) {
    localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh)
  }
  return tokens.access
}

async function fetchCurrentUser(): Promise<User> {
  let access = localStorage.getItem(ACCESS_TOKEN_KEY)
  if (!access) {
    throw new Error('Сессия завершена. Войдите снова.')
  }

  let response = await fetch(`${API_URL}/auth/me/`, {
    headers: { Authorization: `Bearer ${access}` },
  })

  if (response.status === 401) {
    access = await refreshAccessToken()
    response = await fetch(`${API_URL}/auth/me/`, {
      headers: { Authorization: `Bearer ${access}` },
    })
  }

  if (!response.ok) {
    throw new Error(await getErrorMessage(response))
  }

  return (await response.json()) as User
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(
    () => Boolean(localStorage.getItem(ACCESS_TOKEN_KEY)),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!localStorage.getItem(ACCESS_TOKEN_KEY)) return

    let isMounted = true
    fetchCurrentUser()
      .then((currentUser) => {
        if (isMounted) setUser(currentUser)
      })
      .catch((requestError: unknown) => {
        if (isMounted) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Не удалось проверить авторизацию.',
          )
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    const formData = new FormData(event.currentTarget)
    try {
      const response = await fetch(`${API_URL}/auth/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.get('username'),
          password: formData.get('password'),
        }),
      })

      if (!response.ok) {
        throw new Error(await getErrorMessage(response))
      }

      saveTokens((await response.json()) as Tokens)
      setUser(await fetchCurrentUser())
    } catch (requestError: unknown) {
      clearTokens()
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Не удалось выполнить вход.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleLogout() {
    clearTokens()
    setUser(null)
    setError('')
  }

  if (isLoading) {
    return <main className="auth-page"><p role="status">Проверяем сессию…</p></main>
  }

  if (user) {
    return (
      <main className="auth-page">
        <section className="auth-card welcome-card" aria-labelledby="welcome-title">
          <div className="brand-mark" aria-hidden="true">✓</div>
          <p className="eyebrow">ЗАЩИЩЁННАЯ ЗОНА</p>
          <h1 id="welcome-title">Вы вошли</h1>
          <p className="welcome-copy">
            Добро пожаловать, <strong>{user.username}</strong>. Данные загружены
            из защищённого API Django.
          </p>
          <div className="api-status">
            <span className="status-dot" />
            Авторизация подтверждена сервером
          </div>
          <button className="secondary-button" type="button" onClick={handleLogout}>
            Выйти из аккаунта
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">J</div>
        <p className="eyebrow">DJANGO + REACT</p>
        <h1 id="login-title">С возвращением</h1>
        <p className="subtitle">Войдите, чтобы продолжить работу</p>

        <form className="login-form" onSubmit={handleLogin}>
          <label htmlFor="username">Логин</label>
          <input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            placeholder="Введите логин"
            required
          />

          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Введите пароль"
            required
          />

          {error && <p className="error-message" role="alert">{error}</p>}

          <button className="primary-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Входим…' : 'Войти'}
            {!isSubmitting && <span aria-hidden="true">→</span>}
          </button>
        </form>

        <p className="security-note">
          <span aria-hidden="true">◆</span>
          Защищённое соединение с JWT-аутентификацией
        </p>
      </section>
    </main>
  )
}

export default App
