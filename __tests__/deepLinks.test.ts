/**
 * Links from outside may open only known screens with well-formed
 * parameters; everything else lands on Home.
 */
import { safeLinkPath } from '@/lib/deepLinks';

it.each([
  ['winback://closeout', '/closeout'], // the Android widget
  ['winback:///closeout', '/closeout'],
  ['/closeout?game=abc123', '/closeout?game=abc123'],
  ['winback://panic?voice=off', '/panic?voice=off'],
  ['winback://panic?moment=block', '/panic?moment=block'],
  ['winback://', '/'],
  ['/', '/'],
  ['winback://rep?id=box-breath', '/rep?id=box-breath'],
])('lets %s through as %s', (link, expected) => {
  expect(safeLinkPath(link)).toBe(expected);
});

it.each([
  ['a screen no link should open', 'winback://slip'],
  ['an unknown parameter', 'winback://panic?voice=off&evil=1'],
  ['a malformed value', 'winback://panic?voice=loud'],
  ['broken percent-encoding', 'winback://closeout?game=%E0%A4%A'],
  ['an id with odd characters', 'winback://rep?id=../../etc'],
  ['a very long link', `winback://closeout?game=${'a'.repeat(400)}`],
  ['a web address', 'https://example.com/closeout'],
  ['nothing at all', undefined],
])('sends %s home', (_why, link) => {
  expect(safeLinkPath(link)).toBe('/');
});
