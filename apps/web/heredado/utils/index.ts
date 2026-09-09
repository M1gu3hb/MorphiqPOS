'use client';
export function createPageUrl(pageName: string) {
  return '/' + pageName.replace(/ /g, '-');
}
