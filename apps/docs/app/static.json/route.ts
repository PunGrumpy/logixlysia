import { getBreadcrumbItems } from "fumadocs-core/breadcrumb";
import type { OramaDocument } from "fumadocs-core/search/orama-cloud";

import { source } from "@/lib/source";

export const revalidate = false;

export const GET = async (): Promise<Response> => {
  const pages = source.getPages();
  const promises = pages.map(async (page) => {
    const items = getBreadcrumbItems(page.url, source.pageTree, {
      includePage: false,
      includeRoot: true,
    });

    return {
      breadcrumbs: items.flatMap<string>((item, i) =>
        i > 0 && typeof item.name === "string" ? item.name : []
      ),
      description: page.data.description,
      id: page.url,
      structured: await page.data.structuredData,
      tag: page.slugs[0],
      title: page.data.title,
      url: page.url,
    } as OramaDocument;
  });

  return Response.json(
    (await Promise.all(promises)).filter(
      (v) => v !== undefined
    ) as OramaDocument[]
  );
};
