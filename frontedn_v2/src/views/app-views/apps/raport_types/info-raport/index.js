import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import RaportInfo from "../RaportInfo";

const INFO = "INFO";
const InfoRaport = () => {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");
  const searchParamsData = searchParams.get("search");
  const oldRedirect = searchParams.get("oldRedirect");

  return (
    <RaportInfo
      param={params}
      redirect={redirect ? redirect : null}
      oldRedirect={oldRedirect ? oldRedirect : null}
      search={searchParamsData}
      mode={INFO}
    />
  );
};

export default InfoRaport;
