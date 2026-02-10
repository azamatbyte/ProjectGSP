import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import WorkPlaceService from "services/WorkPlaceService";
import { useNavigate } from "react-router-dom";
import Request from "utils/request";
import { useTranslation } from "react-i18next";
import { CheckCircleOutlined, LeftCircleOutlined, PlusCircleOutlined } from "@ant-design/icons";
const ADD = "ADD";
const EDIT = "EDIT";

const AdminForm = props => {
	const { t } = useTranslation();
	const { mode = ADD, param = {} } = props;
	const navigate = useNavigate();
	const [form] = Form.useForm();
	const [submitLoading, setSubmitLoading] = useState(false);
	const { id = "" } = param;


	const workInformation = useCallback (async (id) => {
		try {
			const response = await Request.getRequest(`workplaces/getById/${id}`);
			const { name } = response?.data?.workPlace;
			form.setFieldsValue({
				name
			});
		} catch (error) {
			message.error(t("no_data"));
		}
	}, [form, t]);

	useEffect(() => {
		if (mode === EDIT) {
			workInformation(id);
		}
	}, [mode, id, workInformation]);

	const backHandle = useCallback(() => {
		Modal.confirm({
			title: t("warning"),
			content: t("exit_confirmation"),
			okText: t("yes"),
			cancelText: t("no"),
			onOk: () => {
				navigate(-1);
			},
		});
	}, [navigate, t]);

	useEffect(() => {
		const handleEscKey = (event) => {
			if (event.key === "Escape") {
				backHandle();
			}
		};
		document.addEventListener("keydown", handleEscKey);

		return () => {
			document.removeEventListener("keydown", handleEscKey);
		};
	}, [backHandle, t]);

	const onFinish = async () => {
		setSubmitLoading(true);
		if (mode === EDIT) {
			form.validateFields().then(async values => {
				const res = await WorkPlaceService.updateWorkplace(id, values?.name);
				if (res.status === 200) {
					setSubmitLoading(false);
					message.success(t("work_place_updated_successfully"));
					navigate("/app/work-list");
				}
			}).catch(info => {
				setSubmitLoading(false);
				message.error(t("please_enter_all_required_fields"));
			});
		} else {
			form.validateFields().then(async values => {
				const res = await WorkPlaceService.createWorkplace(values);
				if (res.status === 201) {
					setSubmitLoading(false);
					message.success(t("work_place_created_successfully"));
					navigate("/app/work-list");
				}
			}).catch(info => {
				setSubmitLoading(false);
				message.error(t("please_enter_all_required_fields"));
			});
		}
	};

	return (
		<>
			<Form
				layout="vertical"
				form={form}
				name="advanced_search"
				className="ant-advanced-search-form"
				initialValues={{
					name: "",
				}}
				onFinish={() => onFinish()}
			>
				<PageHeaderAlt className="border-bottom" overlap>
					<div className="container">
						<Flex className="py-2" mobileFlex={false} justifyContent="space-between" alignItems="center">
							<h2 className="mb-3">{mode === "ADD" ? t("add_new_work") : t("edit_work")} </h2>
							<div className="mb-3">
								<Button type="primary" htmlType="submit" loading={submitLoading} tabIndex={2} >
									{mode === "ADD" ? <PlusCircleOutlined /> : <CheckCircleOutlined />}
									{mode === "ADD" ? t("add") : t("save")}
								</Button>
								<Button className="ml-2" onClick={backHandle}><LeftCircleOutlined />{t("back")}</Button>
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
								children: <GeneralField form={form} loading={submitLoading} />,
							},

						]}
					/>
				</div>
			</Form>
		</>
	);
};

export default AdminForm;
