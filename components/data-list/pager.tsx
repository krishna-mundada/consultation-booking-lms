import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SIZES } from "@/lib/list-state";

type PagerProps = {
  page: number;
  size: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
};

/** "Showing 21 to 40 of 87", previous and next, and the page size. Shared by every list so paging is the same everywhere. */
export function Pager({ page, size, total, totalPages, onPage, onSize }: PagerProps) {
  if (total === 0) return null;
  const first = (page - 1) * size + 1;
  const last = Math.min(page * size, total);
  const showing = first > total ? `No results on page ${page}` : `Showing ${first} to ${last} of ${total}`;

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 text-sm">
      <span aria-live="polite" className="text-muted-foreground">
        {showing}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span id="rows-per-page">Rows per page</span>
          <Select value={String(size)} onValueChange={(value) => onSize(Number(value))}>
            <SelectTrigger aria-labelledby="rows-per-page" className="w-[4.5rem] text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </nav>
  );
}
