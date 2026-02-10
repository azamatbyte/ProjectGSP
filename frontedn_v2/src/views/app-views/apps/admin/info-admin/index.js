import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import AdminInfo from "../AdminInfo";

const InfoAdmin = () => {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");
  const searchParamsData = searchParams.get("search");
  const oldRedirect = searchParams.get("oldRedirect");
  return (
    <AdminInfo
      mode="INFO"
      param={params}
      redirect={redirect ? redirect : null}
      oldRedirect={oldRedirect ? oldRedirect : null}
      search={searchParamsData}
    />
  );
};

export default InfoAdmin;
