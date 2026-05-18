const repositoryOwner = process.env.GITHUB_REPO_OWNER ?? 'PunGrumpy'
const repositoryName = process.env.GITHUB_REPO_NAME ?? 'logixlysia'

interface GitHubRelease {
  draft: boolean
  html_url: string
  name: string | null
  prerelease: boolean
  tag_name: string
}

export const getLatestRelease = async (): Promise<GitHubRelease | null> => {
  const response = await fetch(
    `https://api.github.com/repos/${repositoryOwner}/${repositoryName}/releases/latest`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {})
      },
      next: { revalidate: 3600 }
    }
  )

  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as GitHubRelease

  if (data.draft) {
    return null
  }

  return data
}
