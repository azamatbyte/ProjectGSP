import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import SignedInfo from "../SignedInfo";

const INFO = "INFO";

const InfoSignedList = () => {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");
  const searchParamsData = searchParams.get("search");
  const oldRedirect = searchParams.get("oldRedirect");
  return (
    <SignedInfo
      mode={INFO}
      param={params}
      redirect={redirect ? redirect : null}
      oldRedirect={oldRedirect ? oldRedirect : null}
      search={searchParamsData}
    />
  );
};

export default InfoSignedList;
