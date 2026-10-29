/// <reference types="vite/client" />
// Preneto iz Devotion packages/backend/convex/pages.validator.test.ts (main @ c05c40f), SPAJANJE S02.

import { describe, expect, test } from "vitest";

import { pageDocumentValidator } from "./lib/validators";
import schema from "../schema";

/**
 * Kapija za klasu greške koju tsc NE vidi: `pages.get` vraća `{ ...page }`, a
 * Convex returns validator odbija svako polje koje u njemu ne stoji. Kvar se ne
 * ispolji na deploy-u nego tek kad se polje PRVI PUT upiše — `tableColumnCount`
 * je ležao mrtav dok neko nije otvorio tabelu sa telefona, pa je ekran pao na
 * „ReturnsValidationError: Object contains extra field".
 *
 * Zato se ovde ne testira ponašanje nego POKLAPANJE: skup polja `pages` tabele
 * u šemi mora da bude jednak skupu polja `pageDocumentValidator`-a. Novo polje u
 * `schema.ts` obara ovaj test odmah, a ne mesec dana kasnije kod korisnika.
 */
describe("pageDocumentValidator prati šemu", () => {
  const schemaFields = Object.keys(schema.tables.pages.validator.fields).sort();
  // `_id` i `_creationTime` su sistemska polja: šema ih ne nabraja, a dokument
  // ih uvek nosi, pa validator mora da ih ima.
  const validatorFields = Object.keys(pageDocumentValidator.fields)
    .filter((field) => field !== "_id" && field !== "_creationTime")
    .sort();

  test("nijedno polje iz šeme ne fali u validatoru", () => {
    const missing = schemaFields.filter(
      (field) => !validatorFields.includes(field),
    );
    expect(missing).toEqual([]);
  });

  test("validator ne izmišlja polja kojih u šemi nema", () => {
    const extra = validatorFields.filter(
      (field) => !schemaFields.includes(field),
    );
    expect(extra).toEqual([]);
  });

  test("sistemska polja su tu", () => {
    expect(Object.keys(pageDocumentValidator.fields)).toEqual(
      expect.arrayContaining(["_id", "_creationTime"]),
    );
  });
});
