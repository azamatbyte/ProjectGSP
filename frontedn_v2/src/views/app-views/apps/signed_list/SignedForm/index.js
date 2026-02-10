import React, { useState, useEffect, useCallback } from "react";
import PageHeaderAlt from "components/layout-components/PageHeaderAlt";
import { Tabs, Form, Button, message, Modal } from "antd";
import Flex from "components/shared-components/Flex";
import GeneralField from "./GeneralField";
import SignedListService from "services/SignedListService";
import { useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import { useTranslation } from "react-i18next";			
import { LeftCircleOutlined, PlusCircleOutlined, CheckCircleOutlined } from "@ant-design/icons";
const ADD = "ADD";
const EDIT = "EDIT";

const SignedForm = props => {

	const { mode = ADD, param = {} } = props;
	const navigate = useNavigate();
	const [form] = Form.useForm();
	const [uploadedImg, setImage] = useState("");
	const [submitLoading, setSubmitLoading] = useState(false);
	const { id = "" } = param;
	const { t } = useTranslation();


	const userInformation = useCallback(async (id) => {
		try {
			const response = await SignedListService.getById(id);
			const { firstName, lastName, fatherName, workplace, position, notes, birthDate, nationality, rank, gender } = response?.data?.record;
			form.setFieldsValue({
				firstName,
				lastName,
				fatherName,
				workplace,
				position,
				notes,
				birthDate: birthDate ? dayjs(birthDate) : null,
				nationality,
				rank,
				gender,
			});
		} catch (error) {
			console.error("Xatolik:", error);
			message.error(t("data_not_found"));
		}
	}, [form, t]);

	useEffect(() => {
		if (mode === EDIT) {
			userInformation(id);
		}
	}, [mode, userInformation, id]);

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

	const onFinish = async () => {
		setSubmitLoading(true);
		if (mode === EDIT) {
			form.validateFields().then(async values => {
				if (uploadedImg !== "") {
					values.photo = uploadedImg;
				}
				const res = await SignedListService.update(id, values);
				if (res.status === 200) {
					setSubmitLoading(false);
					message.success(t("signed_updated_successfully"));
					navigate(-1);
				}
			}).catch(info => {
				setSubmitLoading(false);
				message.error(t("please_enter_all_required_fields"));
			});
		} else if (mode === ADD) {
			form.validateFields().then(async values => {
				const res = await SignedListService.create(values);
				if (res.status === 201) {
					setSubmitLoading(false);
					message.success(t("signed_created_successfully"));
					navigate(-1);
				}
			}).catch(info => {
				setSubmitLoading(false);
				message.error(t("please_enter_all_required_fields"));
			});
		}
	};

	useEffect(() => {
		const handleEscKey = (event) => {
			if (event.key === "Escape") {
				event.preventDefault();
				backHandle();
			}
		};

		document.addEventListener("keydown", handleEscKey);

		return () => {
			document.removeEventListener("keydown", handleEscKey);
		};
	}, [backHandle]);

	return (
		<>
			<Form
				layout="vertical"
				form={form}
				name="advanced_search"
				className="ant-advanced-search-form"
				initialValues={{
					heightUnit: "cm",
					widthUnit: "cm",
					weightUnit: "kg"
				}}
			>
				<PageHeaderAlt className="border-bottom" overlap>
					<div className="container">
						<Flex className="py-2" mobileFlex={false} justifyContent="space-between" alignItems="center">
							<h2 className="mb-3">{mode === "ADD" ? t("add_new_signed") : t("edit_signed")} </h2>
							<div className="mb-3">
								<Button type="primary" htmlType="submit" tabIndex={10} onClick={onFinish} loading={submitLoading} >
									{mode === "ADD" ? <PlusCircleOutlined /> : <CheckCircleOutlined />}
									{mode === "ADD" ? t("add") : t("save")}
								</Button>
								<Button className="ml-2" onClick={backHandle} tabIndex={11}><LeftCircleOutlined />{t("back")}</Button>
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
								children: <GeneralField form={form} setImage={setImage} loading={submitLoading} id={id} mode={mode} />,
							},

						]}
					/>
				</div>
			</Form>
		</>
	);
};

export default SignedForm;
