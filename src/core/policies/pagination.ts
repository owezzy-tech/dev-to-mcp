import { InvalidInputError } from "../../errors/api-errors.ts";

export type Pagination = {
  readonly page: number;
  readonly per_page: number;
};

const MIN_PAGE = 1;
const MAX_PAGE = 100;
const MIN_PER_PAGE = 1;
const MAX_PER_PAGE = 1000;

export function parsePagination(input: Pagination): Pagination {
  const pageIsValid =
    Number.isFinite(input.page) &&
    Number.isInteger(input.page) &&
    input.page >= MIN_PAGE &&
    input.page <= MAX_PAGE;
  const perPageIsValid =
    Number.isFinite(input.per_page) &&
    Number.isInteger(input.per_page) &&
    input.per_page >= MIN_PER_PAGE &&
    input.per_page <= MAX_PER_PAGE;

  if (!pageIsValid || !perPageIsValid) {
    throw new InvalidInputError(
      "Pagination values are outside the supported range.",
    );
  }
  return input;
}
