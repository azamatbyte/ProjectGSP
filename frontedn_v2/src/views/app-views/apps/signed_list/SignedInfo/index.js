import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import LogListField from "./LogListField";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import SignedListService from "services/SignedListService";
import { useTranslation } from "react-i18next";

const ADD = "ADD";
const INFO = "INFO";

const SignedInfo = props => {
	const { t } = useTranslation();
	const { mode = ADD, param } = props;
	const [form] = Form.useForm();
	const [loading, setLoading] = useState(false);
	const navigate = useNavigate();

	useEffect(() => {
		if (mode === INFO) {
			const fetchAdminData = async (id) => {
				try {
					setLoading(true);
					const response = await SignedListService.getById(id);
					console.log("responseinfo", response);
					if (response.status !== 200) throw new Error("Failed to fetch data");

					const data = response?.data?.record;

					form.setFieldsValue({
						firstName: data?.firstName,
						lastName: data?.lastName,
						fatherName: data?.fatherName,
						birthDate: data?.birthDate ? dayjs(data?.birthDate).format("DD.MM.YYYY") : null,
						workplace: data?.workplace,	
						position: data?.position,
						notes: data?.notes,
						rank: data?.rank,
						gender: data?.gender === "female" ? t("female") : data?.gender === "male" ? t("male") : data?.gender,
					});
				} catch (error) {
					message.error(t("failed_to_load_signed_data"));
					console.error("Error fetching data:", error);
				} finally {
					setLoading(false);
				}
			};

			if (param?.id) {
				fetchAdminData(param?.id);
			}
		}
	}, [param?.id, mode, form, t]);
	

	const handleBack = useCallback(() => {
		navigate(-1);
	}, [navigate]);

	useEffect(() => {
		const handleEscKey = (event) => {
			if (event.key === "Escape") {
				// event.preventDefault();
				handleBack();
			}
		};

		document.addEventListener("keydown", handleEscKey);

		return () => {
			document.removeEventListener("keydown", handleEscKey);
		};
	}, [handleBack]);

	


	return (
		<>
			<Form
				layout="vertical"
				form={form}
				name="advanced_search"
				className="ant-advanced-search-form"
			>
				<PageHeaderAlt className="border-bottom" overlap>
					<div className="container">
						<Flex className="py-2" mobileFlex={false} justifyContent="space-between" alignItems="center">
							<h2 className="mb-3"> {t("info_signed")} </h2>
							<div className="mb-3">
								<Button className="mr-2" onClick={() => handleBack()} htmlType="submit">Back</Button>
							</div>
						</Flex>
					</div>
				</PageHeaderAlt>
				<div className="container">
					<Tabs
						defaultActiveKey="1"
						style={{ marginTop: 30 }}
						items={[
							{
								label: t("general"),
								key: "1",
								children: <GeneralField loading={loading} form={form}/>,
							},
							
							{
								label: t("logs"),
								key: "4",
								children: <LogListField id={param?.id} />,
							},
						]}
					/>
				</div>
			</Form>
		</>
	);
};

export default SignedInfo;
