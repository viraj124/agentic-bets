import { useEffect, useState } from "react";
import { useIsMounted } from "usehooks-ts";
import { usePublicClient } from "wagmi";
import { useSelectedNetwork } from "~~/hooks/scaffold-eth";
import {
  Contract,
  ContractCodeStatus,
  ContractName,
  UseDeployedContractConfig,
  contracts,
} from "~~/utils/scaffold-eth/contract";

type DeployedContractData<TContractName extends ContractName> = {
  data: Contract<TContractName> | undefined;
  isLoading: boolean;
};

const CONTRACT_STATUS_TTL_MS = 60_000;
type ContractStatusCacheEntry = {
  status: ContractCodeStatus;
  checkedAt: number;
  inFlight?: Promise<ContractCodeStatus>;
};

/**
 * Cache bytecode checks across hooks/components so repeated reads for the same
 * contract don't trigger duplicate RPC calls during page load.
 */
const contractStatusCache = new Map<string, ContractStatusCacheEntry>();

/**
 * Gets the matching contract info for the provided contract name from the contracts present in deployedContracts.ts
 * and externalContracts.ts corresponding to targetNetworks configured in scaffold.config.ts
 */
export function useDeployedContractInfo<TContractName extends ContractName>(
  config: UseDeployedContractConfig<TContractName>,
): DeployedContractData<TContractName>;
/**
 * @deprecated Use object parameter version instead: useDeployedContractInfo({ contractName: "YourContract" })
 */
export function useDeployedContractInfo<TContractName extends ContractName>(
  contractName: TContractName,
): DeployedContractData<TContractName>;

export function useDeployedContractInfo<TContractName extends ContractName>(
  configOrName: UseDeployedContractConfig<TContractName> | TContractName,
): DeployedContractData<TContractName> {
  const isMounted = useIsMounted();

  const finalConfig: UseDeployedContractConfig<TContractName> =
    typeof configOrName === "string" ? { contractName: configOrName } : (configOrName as any);

  useEffect(() => {
    if (typeof configOrName === "string") {
      console.warn(
        "Using `useDeployedContractInfo` with a string parameter is deprecated. Please use the object parameter version instead.",
      );
    }
  }, [configOrName]);
  const { contractName, chainId } = finalConfig;
  const selectedNetwork = useSelectedNetwork(chainId);
  const deployedContract = contracts?.[selectedNetwork.id]?.[contractName as ContractName] as Contract<TContractName>;
  const [status, setStatus] = useState<ContractCodeStatus>(ContractCodeStatus.LOADING);
  const publicClient = usePublicClient({ chainId: selectedNetwork.id });
  const cacheKey = deployedContract ? `${selectedNetwork.id}:${deployedContract.address.toLowerCase()}` : "";

  useEffect(() => {
    let cancelled = false;

    const checkContractDeployment = async () => {
      try {
        if (!isMounted() || !publicClient) return;

        if (!deployedContract) {
          if (!cancelled) setStatus(ContractCodeStatus.NOT_FOUND);
          return;
        }

        const now = Date.now();
        const cached = contractStatusCache.get(cacheKey);
        if (cached && !cached.inFlight && now - cached.checkedAt < CONTRACT_STATUS_TTL_MS) {
          if (!cancelled) setStatus(cached.status);
          return;
        }

        if (cached?.inFlight) {
          const inFlightStatus = await cached.inFlight;
          if (!cancelled) setStatus(inFlightStatus);
          return;
        }

        const inFlight = (async () => {
          try {
            const code = await publicClient.getBytecode({
              address: deployedContract.address,
            });
            return code === "0x" ? ContractCodeStatus.NOT_FOUND : ContractCodeStatus.DEPLOYED;
          } catch {
            return ContractCodeStatus.NOT_FOUND;
          }
        })();

        contractStatusCache.set(cacheKey, {
          status: ContractCodeStatus.LOADING,
          checkedAt: now,
          inFlight,
        });

        const resolvedStatus = await inFlight;
        contractStatusCache.set(cacheKey, {
          status: resolvedStatus,
          checkedAt: Date.now(),
        });

        if (!cancelled) setStatus(resolvedStatus);
      } catch (e) {
        console.error(e);
        if (!cancelled) setStatus(ContractCodeStatus.NOT_FOUND);
      }
    };

    checkContractDeployment();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, contractName, deployedContract, isMounted, publicClient]);

  return {
    data: status === ContractCodeStatus.DEPLOYED ? deployedContract : undefined,
    isLoading: status === ContractCodeStatus.LOADING,
  };
}
