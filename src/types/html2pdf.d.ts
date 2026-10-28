// Minimal type declaration for html2pdf.js
// Full API: https://ekoopmans.github.io/html2pdf.js/
declare module "html2pdf.js" {
  interface Options {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: { scale?: number; useCORS?: boolean; logging?: boolean; [key: string]: unknown };
    jsPDF?: { unit?: string; format?: string | number[]; orientation?: string; [key: string]: unknown };
    pagebreak?: { mode?: string | string[]; [key: string]: unknown };
  }

  interface Html2Pdf {
    set(options: Options): Html2Pdf;
    from(element: HTMLElement | string): Html2Pdf;
    save(): Promise<void>;
    outputPdf(type?: string): unknown;
    then(fn: (pdf: unknown) => void): Html2Pdf;
    catch(fn: (err: unknown) => void): Html2Pdf;
  }

  function html2pdf(): Html2Pdf;
  function html2pdf(element: HTMLElement, options?: Options): Html2Pdf;
  export = html2pdf;
}
