export const resolveSubprojectIndex = (
  subprojects: any[] | undefined | null,
  requestedIndex: unknown
): number | undefined => {
  const list = Array.isArray(subprojects) ? subprojects : [];

  const parsed =
    typeof requestedIndex === 'number'
      ? requestedIndex
      : typeof requestedIndex === 'string'
      ? Number.parseInt(requestedIndex, 10)
      : Number.NaN;

  if (Number.isInteger(parsed) && parsed >= 0 && parsed < list.length) {
    return parsed;
  }

  if (list.length === 1) {
    return 0;
  }

  const rfqIndexes = list.reduce((acc: number[], sp: any, i: number) => {
    if (sp?.pricing?.type === 'rfq') acc.push(i);
    return acc;
  }, []);

  if (rfqIndexes.length === 1) {
    return rfqIndexes[0];
  }

  return undefined;
};

export const normalizeExtraOptions = (
  extraOptions: unknown,
  projectExtraOptions: any[] | undefined | null
): { extraOptionId: string; bookedPrice: number }[] => {
  if (!Array.isArray(extraOptions) || !Array.isArray(projectExtraOptions)) {
    return [];
  }

  const seen = new Set<string>();
  const result: { extraOptionId: string; bookedPrice: number }[] = [];

  for (const item of extraOptions) {
    if (typeof item === 'object' && item !== null && typeof item.extraOptionId === 'string') {
      const match = projectExtraOptions.find(
        (opt: any) => opt._id?.toString() === item.extraOptionId
      );
      if (match && !seen.has(item.extraOptionId)) {
        seen.add(item.extraOptionId);
        result.push({
          extraOptionId: item.extraOptionId,
          bookedPrice: typeof item.bookedPrice === 'number' ? item.bookedPrice : match.price,
        });
      }
      continue;
    }

    const idx =
      typeof item === 'number'
        ? item
        : typeof item === 'string'
        ? Number.parseInt(item, 10)
        : Number.NaN;

    if (Number.isInteger(idx) && idx >= 0 && idx < projectExtraOptions.length) {
      const opt = projectExtraOptions[idx];
      const id = opt._id?.toString();
      if (id && !seen.has(id)) {
        seen.add(id);
        result.push({ extraOptionId: id, bookedPrice: opt.price });
      }
    }
  }

  return result;
};
