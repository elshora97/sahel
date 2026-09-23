"use client";

import NextLink from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button, buttonClass } from "@/components/ds/button";
import { Modal } from "@/components/ds/modal";
import { entityBase } from "@/lib/admin/paths";
import { readResult, withoutResult, type ActionResult } from "@/lib/admin/result";

/**
 * Spec §6.2: every successful create, update and delete ends here. The
 * Server Action redirected with ?done=&name=; show the modal, then drop the
 * parameters so a refresh or Back doesn't show it again.
 */
export function ActionResultModal() {
  const t = useTranslations("admin");
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);

  useEffect(() => {
    const current = new URLSearchParams(params.toString());
    const found = readResult(current);
    if (!found) return;
    setResult(found);
    router.replace(pathname + withoutResult(current), { scroll: false });
  }, [params, pathname, router]);

  const close = () => setResult(null);
  const base = entityBase(pathname);
  const kind = result?.kind ?? "saved";

  return (
    <Modal
      open={result !== null}
      onClose={close}
      title={t(`feedback.${kind}`)}
      actions={
        <>
          {kind === "created" && base && (
            <NextLink href={`${base}/new`} className={buttonClass("secondary")} onClick={close}>
              {t("actions.addAnother")}
            </NextLink>
          )}
          {kind === "saved" && base && (
            <NextLink href={base} className={buttonClass("secondary")} onClick={close}>
              {t("actions.backToList")}
            </NextLink>
          )}
          <Button variant="primary" data-autofocus onClick={close}>
            {t("actions.done")}
          </Button>
        </>
      }
    >
      <p>{t(`feedback.${kind}Body`, { name: result?.name ?? "" })}</p>
    </Modal>
  );
}
