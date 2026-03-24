import { Link } from 'fumadocs-core/framework'
import type { Metadata } from 'next'
import { createMetadata } from '@/lib/metadata'
import { ReleaseMarkdown } from './release-markdown'

const repositoryOwner = process.env.GITHUB_REPO_OWNER ?? 'PunGrumpy'
const repositoryName = process.env.GITHUB_REPO_NAME ?? 'logixlysia'
const releasesPerPage = 10

interface GitHubRelease {
  body: string | null
  draft: boolean
  html_url: string
  id: number
  name: string | null
  prerelease: boolean
  published_at: string | null
  tag_name: string
}

const getReleases = async () => {
  const response = await fetch(
    `https://api.github.com/repos/${repositoryOwner}/${repositoryName}/releases?per_page=${releasesPerPage}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN
          ? {
              Authorization: `Bearer ${process.env.GITHUB_TOKEN}`
            }
          : {})
      },
      next: {
        revalidate: 3600
      }
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to fetch releases (${response.status})`)
  }

  const data = (await response.json()) as GitHubRelease[]

  return data.filter(release => !release.draft)
}

const formatReleaseDate = (date: string | null) => {
  if (!date) {
    return 'Unknown date'
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  }).format(new Date(date))
}

export const metadata: Metadata = createMetadata(
  'Changelog | Logixlysia',
  'Latest Logixlysia releases from GitHub, including version, changelog, and release date.'
)

const ChangelogPage = async () => {
  try {
    const releases = await getReleases()

    return (
      <main className="container max-w-4xl py-10 md:py-16">
        <div className="space-y-2">
          <h1 className="font-light font-serif text-4xl md:text-5xl">
            Changelog
          </h1>
          <p className="text-muted-foreground">
            Latest releases for {repositoryOwner}/{repositoryName}. Data
            refreshes automatically every hour.
          </p>
        </div>

        <div className="mt-10 space-y-8">
          {releases.map(release => (
            <article
              className="space-y-4 rounded-lg border p-6"
              key={release.id}
            >
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="font-medium text-2xl">
                  {release.name || release.tag_name}
                </h2>
                <span className="rounded bg-primary/10 px-2 py-1 font-mono text-primary text-xs">
                  {release.tag_name}
                </span>
                {release.prerelease ? (
                  <span className="rounded bg-yellow-500/10 px-2 py-1 text-xs text-yellow-600">
                    Pre-release
                  </span>
                ) : null}
              </div>

              <p className="text-muted-foreground text-sm">
                Released on {formatReleaseDate(release.published_at)}
              </p>

              <ReleaseMarkdown>
                {release.body?.trim() || 'No changelog notes provided.'}
              </ReleaseMarkdown>

              <Link
                className="inline-flex text-sm underline underline-offset-4"
                href={release.html_url}
                rel="noopener noreferrer"
                target="_blank"
              >
                View release on GitHub
              </Link>
            </article>
          ))}
        </div>
      </main>
    )
  } catch (error) {
    console.error('Failed to load changelog releases', error)

    return (
      <main className="container max-w-4xl py-10 md:py-16">
        <h1 className="font-light font-serif text-4xl md:text-5xl">
          Changelog
        </h1>
        <p className="mt-4 text-muted-foreground">
          Unable to load releases right now. Please try again shortly.
        </p>
      </main>
    )
  }
}

export default ChangelogPage
