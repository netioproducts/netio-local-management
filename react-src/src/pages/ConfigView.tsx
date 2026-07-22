import { useEffect, useState } from "react";
import { deviceService } from "../services/deviceService";

export const ConfigView = () => {
  const [config, setConfig] = useState(null);

  useEffect(() => {
    const configPromise = deviceService.getConfig();
    configPromise.then((data) => {
      setConfig(data);
    });
  }, []);

  return (
    <>
      <div>
        Config View Page
      </div>
      <div>
        {JSON.stringify(config)}
      </div>
    </>
  );
}