import { siteUrl } from 'gcss-config';
import { getSitemapEntries } from '../lib/content/contentSource';

function toAbsoluteUrl(pathname: string) {
	return new URL(pathname, siteUrl).toString();
}

function escapeXml(value: string) {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

export async function GET() {
	const entries = await getSitemapEntries();

	const urlSet = new Set<string>();

	for (const entry of entries) {
		if (entry.productSlug) {
			urlSet.add(toAbsoluteUrl(`/${entry.locale}/products/${entry.productSlug}/`));
			continue;
		}

		if (entry.kind) {
			urlSet.add(toAbsoluteUrl(`/${entry.locale}/${entry.kind}/`));
			continue;
		}

		if (entry.legalSlug) {
			urlSet.add(toAbsoluteUrl(`/${entry.locale}/${entry.legalSlug}/`));
			continue;
		}

		urlSet.add(toAbsoluteUrl(`/${entry.locale}/`));
	}

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Array.from(urlSet)
	.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
	.join('\n')}
</urlset>`;

	return new Response(body, {
		headers: {
			'Content-Type': 'application/xml; charset=utf-8',
		},
	});
}
