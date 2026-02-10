import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import RaportForm from "../RaportForm";

const EditRaport = () => {
  const params = useParams();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");
  const searchParamsData = searchParams.get("search");
  const oldRedirect = searchParams.get("oldRedirect");
  const { id } = params;
  return (
    <RaportForm
      mode="EDIT"
      param={params}
      id={id}
      redirect={redirect ? redirect : null}
      oldRedirect={oldRedirect ? oldRedirect : null}
      search={searchParamsData}
    />
  );
};

export default EditRaport;
