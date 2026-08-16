import {
	activeLocales as configuredActiveLocales,
	defaultLocale as configuredDefaultLocale,
	supportedLocales as configuredSupportedLocales,
} from 'gcss-config';
import { en } from './locales/en';
import { fr } from './locales/fr';
import { zhCn } from './locales/zhCn';

export const defaultLocale = configuredDefaultLocale;
export const supportedLocales = configuredSupportedLocales;
export const activeLocales = configuredActiveLocales;

export type SupportedLocale = (typeof supportedLocales)[number];
export type ActiveLocale = (typeof activeLocales)[number];

type BaseDictionary = {
	locale: SupportedLocale;
	label: string;
	htmlLang: string;
	meta: {
		title: string;
		description: string;
	};
	navigation: Record<keyof typeof en.navigation, string>;
	ui: Record<keyof typeof en.ui, string>;
	site: Record<keyof typeof en.site, string>;
	home: Record<keyof typeof en.home, string>;
	footer: Record<keyof typeof en.footer, string>;
};

const dictionaries: Record<SupportedLocale, BaseDictionary> = {
	en,
	fr,
	'zh-cn': zhCn,
};

export function isSupportedLocale(value: string | undefined): value is SupportedLocale {
	return Boolean(value && supportedLocales.includes(value as SupportedLocale));
}

export function isActiveLocale(value: string | undefined): value is ActiveLocale {
	return Boolean(value && activeLocales.includes(value as ActiveLocale));
}

export function getDictionary(locale: SupportedLocale) {
	return dictionaries[locale];
}

export function getLocalePath(locale: SupportedLocale, path = '/') {
	const normalizedPath = path === '/' ? '' : path.startsWith('/') ? path : `/${path}`;
	const value = `/${locale}${normalizedPath}/`.replace(/\/+/g, '/');
	return value.endsWith('/') ? value : `${value}/`;
}

export function getAlternateLinks(path = '/') {
	return activeLocales.map((locale) => ({
		locale,
		href: getLocalePath(locale, path),
	}));
}
