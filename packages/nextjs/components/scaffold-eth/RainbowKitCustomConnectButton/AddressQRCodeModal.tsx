import { QRCodeSVG } from "qrcode.react";
import { Address as AddressType } from "viem";
import { IdentityBadge } from "~~/components/bankrbets/IdentityBadge";
import { useResolvedAddresses } from "~~/hooks/bankrbets/useResolvedAddresses";

type AddressQRCodeModalProps = {
  address: AddressType;
  modalId: string;
};

export const AddressQRCodeModal = ({ address, modalId }: AddressQRCodeModalProps) => {
  const { data: resolvedMap } = useResolvedAddresses([address]);
  const resolved = resolvedMap?.get(address.toLowerCase());

  return (
    <>
      <div>
        <input type="checkbox" id={`${modalId}`} className="modal-toggle" />
        <label htmlFor={`${modalId}`} className="modal cursor-pointer">
          <label className="modal-box relative">
            {/* dummy input to capture event onclick on modal box */}
            <input className="h-0 w-0 absolute top-0 left-0" />
            <label htmlFor={`${modalId}`} className="btn btn-ghost btn-sm btn-circle absolute right-3 top-3">
              ✕
            </label>
            <div className="space-y-3 py-6">
              <div className="flex flex-col items-center gap-6">
                <QRCodeSVG value={address} size={256} />
                <IdentityBadge address={address} resolved={resolved} size="md" showAddress />
              </div>
            </div>
          </label>
        </label>
      </div>
    </>
  );
};
